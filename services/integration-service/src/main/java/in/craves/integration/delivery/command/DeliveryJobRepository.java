package in.craves.integration.delivery.command;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
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

    public UUID insert(UUID orderId, UUID chefSubOrderId, RoutingResult routingResult) {
        UUID deliveryJobId = UUID.randomUUID();
        int inserted = jdbc.update("""
            INSERT INTO delivery_schema.delivery_job
                (id, chef_sub_order_id, order_id, assignment_id, provider_id, provider_delivery_id,
                 status, tracking_url, quote_snapshot, booked_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, now(), now(), now())
            ON CONFLICT (chef_sub_order_id) DO NOTHING
            """,
            deliveryJobId,
            chefSubOrderId,
            orderId,
            routingResult.intelligenceAssignment().assignmentId(),
            routingResult.providerId(),
            routingResult.delivery().providerDeliveryId(),
            routingResult.delivery().status().name(),
            routingResult.delivery().trackingUrl(),
            writeJson(routingResult)
        );
        if (inserted == 1) {
            return deliveryJobId;
        }
        return findIdByChefSubOrderId(chefSubOrderId)
            .orElseThrow(() -> new IllegalStateException("Delivery job conflict occurred without an existing row"));
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Delivery routing audit could not be serialized", ex);
        }
    }
}
