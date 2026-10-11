package in.craves.integration.delivery.command;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeliveryJobRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public DeliveryJobRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Optional<UUID> findIdByChefSubOrderId(UUID chefSubOrderId) {
        List<UUID> rows = jdbc.query("""
            SELECT id
            FROM delivery_schema.delivery_job
            WHERE chef_sub_order_id = ?
            """, (rs, rowNumber) -> rs.getObject("id", UUID.class), chefSubOrderId);
        return rows.stream().findFirst();
    }

    public Optional<HandoffJob> findHandoffJob(UUID deliveryJobId) {
        return jdbc.query("""
            SELECT id, chef_sub_order_id, order_id, assignment_id, provider_id,
                   provider_delivery_id, status, last_status_observed_at
            FROM delivery_schema.delivery_job WHERE id = ?
            """, (rs, row) -> new HandoffJob(
                rs.getObject("id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class),
                rs.getObject("order_id", UUID.class),
                rs.getObject("assignment_id", UUID.class),
                rs.getString("provider_id"),
                rs.getString("provider_delivery_id"),
                rs.getString("status"),
                rs.getObject("last_status_observed_at", OffsetDateTime.class).toInstant()
            ), deliveryJobId).stream().findFirst();
    }

    /** Caller must wrap this and the corresponding outbox event in one transaction. */
    public boolean switchToPidge(UUID deliveryJobId, String oldBorzoOrderId,
                                 ProviderDelivery pidge, Instant observedAt) {
        String status = pidge.status().name();
        return jdbc.update("""
            UPDATE delivery_schema.delivery_job
            SET provider_id = 'pidge', provider_delivery_id = ?, status = ?,
                provider_status = ?, tracking_url = ?, booked_at = now(),
                provider_quote_id = NULL, assigned_agent_id = NULL,
                quote_snapshot = jsonb_build_object(
                    'selectedProviderId', 'pidge',
                    'handoffFromProviderId', 'borzo',
                    'handoffFromProviderDeliveryId', ?,
                    'pidgeProviderDeliveryId', ?,
                    'pidgeDeliveryFee', CAST(? AS numeric),
                    'previousRouting', quote_snapshot),
                last_status_observed_at = ?, last_status_source = 'RECONCILIATION',
                next_tracking_at = CASE WHEN ? IN ('DELIVERED','CANCELLED','RETURNED','FAILED')
                    THEN NULL ELSE now() END,
                tracking_attempt_count = 0, tracking_processing_started_at = NULL,
                updated_at = now()
            WHERE id = ? AND provider_id = 'borzo' AND provider_delivery_id = ?
              AND status IN ('PENDING','SEARCHING','DELAYED')
            """, pidge.providerDeliveryId(), status, pidge.providerStatus(),
            pidge.trackingUrl(), oldBorzoOrderId, pidge.providerDeliveryId(),
            pidge.deliveryFeeAmount(), databaseTimestamp(observedAt), status, deliveryJobId,
            oldBorzoOrderId) == 1;
    }

    public UUID insert(UUID orderId, UUID chefSubOrderId, RoutingResult routingResult) {
        UUID deliveryJobId = UUID.randomUUID();
        Instant observedAt = routingResult.delivery().observedAt() == null
            ? Instant.now()
            : routingResult.delivery().observedAt();
        String normalizedStatus = routingResult.delivery().status().name();
        int inserted = jdbc.update("""
            INSERT INTO delivery_schema.delivery_job
                (id, chef_sub_order_id, order_id, assignment_id, provider_id, provider_delivery_id,
                 status, provider_status, tracking_url, quote_snapshot, booked_at,
                 last_status_observed_at, last_status_source, next_tracking_at,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, now(), ?, 'CREATE',
                    CASE WHEN ? IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED')
                         THEN NULL ELSE now() END,
                    now(), now())
            ON CONFLICT (chef_sub_order_id) DO NOTHING
            """,
            deliveryJobId,
            chefSubOrderId,
            orderId,
            routingResult.intelligenceAssignment().assignmentId(),
            routingResult.providerId(),
            routingResult.delivery().providerDeliveryId(),
            normalizedStatus,
            routingResult.delivery().providerStatus(),
            routingResult.delivery().trackingUrl(),
            writeJson(routingResult),
            databaseTimestamp(observedAt),
            normalizedStatus
        );
        if (inserted == 1) {
            return deliveryJobId;
        }
        return findIdByChefSubOrderId(chefSubOrderId)
            .orElseThrow(() -> new IllegalStateException("Delivery job conflict occurred without an existing row"));
    }

    static OffsetDateTime databaseTimestamp(Instant value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }

    public record HandoffJob(UUID id, UUID chefSubOrderId, UUID orderId,
                             UUID assignmentId, String providerId, String providerDeliveryId,
                             String status, Instant lastStatusObservedAt) {}

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Delivery routing audit could not be serialized", ex);
        }
    }
}
