package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Reads committed provider-transition evidence; never books, cancels, or updates a delivery. */
@Repository
public class DeliveryHandoffProofRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final org.springframework.transaction.support.TransactionTemplate read;

    public DeliveryHandoffProofRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.read = new org.springframework.transaction.support.TransactionTemplate(
            new org.springframework.jdbc.datasource.DataSourceTransactionManager(
                java.util.Objects.requireNonNull(jdbc.getDataSource())));
        this.read.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.read.setReadOnly(true);
        this.read.setTimeout(4);
        this.json = json.copy()
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_INTEGER_FOR_INTS)
            .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }

    public Optional<JsonNode> find(UUID jobId, UUID eventId) {
        return read.execute(status -> {
            // Local to this isolated read transaction, including on timeout/rollback.
            jdbc.queryForObject("SELECT set_config('statement_timeout', '3000ms', true)", String.class);
            return findCommitted(jobId, eventId);
        });
    }

    private Optional<JsonNode> findCommitted(UUID jobId, UUID eventId) {
        var matches = jdbc.query("""
            SELECT o.payload::text
            FROM delivery_schema.delivery_borzo_pidge_handoff h
            JOIN delivery_schema.delivery_job j ON j.id = h.delivery_job_id
            JOIN delivery_schema.delivery_outbox o
              ON o.aggregate_id = j.id AND o.correlation_id = j.order_id
             AND o.aggregate_type = 'DELIVERY_JOB'
             AND o.event_type = 'DELIVERY_STATUS_CHANGED'
            WHERE h.delivery_job_id = ? AND o.payload->>'eventId' = ?
              AND h.state = 'COMPLETED'
              AND h.borzo_cancel_intent_at IS NOT NULL
              AND h.borzo_cancelled_at IS NOT NULL AND h.completed_at IS NOT NULL
              AND h.borzo_cancelled_at >= h.borzo_cancel_intent_at
              AND h.completed_at >= h.borzo_cancelled_at
              AND j.provider_id = 'pidge'
              AND j.provider_delivery_id = h.pidge_provider_delivery_id
              AND o.payload->>'eventType' = 'DELIVERY_STATUS_CHANGED'
              AND o.payload->>'eventVersion' = '1.0'
              AND o.payload->>'source' = 'integration-service'
              AND o.payload->>'correlationId' = j.order_id::text
              AND o.payload->>'subject' = 'delivery-job/' || j.id::text
              AND o.payload->'data'->>'deliveryJobId' = j.id::text
              AND o.payload->'data'->>'orderId' = j.order_id::text
              AND o.payload->'data'->>'chefSubOrderId' = j.chef_sub_order_id::text
              AND o.payload->'data'->>'providerId' = 'pidge'
              AND o.payload->'data'->>'providerDeliveryId' = h.pidge_provider_delivery_id
              AND o.payload->'data'->>'handoffFromProviderId' = 'borzo'
              AND o.payload->'data'->>'handoffFromProviderDeliveryId' = h.borzo_provider_delivery_id
            LIMIT 2
            """, (rs, row) -> rs.getString(1), jobId, eventId.toString());
        if (matches.size() != 1) return Optional.empty();
        try {
            return Optional.of(json.readTree(matches.getFirst()));
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("Stored handoff event cannot be decoded", exception);
        }
    }
}
