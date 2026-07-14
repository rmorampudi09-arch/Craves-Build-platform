package in.craves.integration.delivery.command;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class DeliveryCommandRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public DeliveryCommandRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CommandRecord createOrFind(DeliveryCommandMessage message) {
        jdbc.update("""
            INSERT INTO delivery_schema.delivery_command
                (id, chef_sub_order_id, order_id, command_type, status, ready_at, dispatch_at,
                 idempotency_key, payload, source_event_id, created_at, updated_at)
            VALUES (?, ?, ?, 'QUOTE_AND_CREATE', 'SCHEDULED', ?, ?, ?, ?::jsonb, ?, now(), now())
            ON CONFLICT (chef_sub_order_id) DO NOTHING
            """,
            message.commandId(),
            message.chefSubOrderId(),
            message.orderId(),
            message.readyAt(),
            message.dispatchAt(),
            message.idempotencyKey(),
            writeJson(message),
            message.sourceEventId()
        );
        return findByChefSubOrderId(message.chefSubOrderId())
            .orElseThrow(() -> new IllegalStateException("Delivery command was not persisted"));
    }

    public Optional<CommandRecord> findByChefSubOrderId(UUID chefSubOrderId) {
        return queryOne("""
            SELECT id, chef_sub_order_id, order_id, status, attempt_count, payload,
                   scheduled_sequence_number, service_bus_message_id
            FROM delivery_schema.delivery_command
            WHERE chef_sub_order_id = ?
            """, chefSubOrderId);
    }

    public Optional<CommandRecord> findById(UUID commandId) {
        return queryOne("""
            SELECT id, chef_sub_order_id, order_id, status, attempt_count, payload,
                   scheduled_sequence_number, service_bus_message_id
            FROM delivery_schema.delivery_command
            WHERE id = ?
            """, commandId);
    }

    public boolean recordScheduled(UUID commandId, long sequenceNumber, String serviceBusMessageId) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_command
            SET scheduled_sequence_number = ?, service_bus_message_id = ?, updated_at = now()
            WHERE id = ? AND scheduled_sequence_number IS NULL
            """, sequenceNumber, serviceBusMessageId, commandId) == 1;
    }

    @Transactional
    public Optional<CommandRecord> claim(UUID commandId, int maximumAttempts) {
        List<CommandRecord> rows = jdbc.query("""
            UPDATE delivery_schema.delivery_command
            SET status = 'PROCESSING',
                attempt_count = attempt_count + 1,
                processing_started_at = now(),
                last_error = NULL,
                updated_at = now()
            WHERE id = ?
              AND attempt_count < ?
              AND (
                    status IN ('SCHEDULED', 'FAILED')
                    OR (status = 'PROCESSING' AND processing_started_at < now() - interval '10 minutes')
                  )
            RETURNING id, chef_sub_order_id, order_id, status, attempt_count, payload,
                      scheduled_sequence_number, service_bus_message_id
            """, this::mapRow, commandId, maximumAttempts);
        return rows.stream().findFirst();
    }

    public void markCompleted(UUID commandId) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_command
            SET status = 'COMPLETED', processing_started_at = NULL, last_error = NULL, updated_at = now()
            WHERE id = ?
            """, commandId);
    }

    public void markFailed(UUID commandId, String safeError) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_command
            SET status = 'FAILED', processing_started_at = NULL, last_error = ?, updated_at = now()
            WHERE id = ? AND status = 'PROCESSING'
            """, truncate(safeError, 2000), commandId);
    }

    public void markDeadLetter(UUID commandId, String safeError) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_command
            SET status = 'DEAD_LETTER', processing_started_at = NULL, last_error = ?, updated_at = now()
            WHERE id = ?
            """, truncate(safeError, 2000), commandId);
    }

    private Optional<CommandRecord> queryOne(String sql, Object argument) {
        List<CommandRecord> rows = jdbc.query(sql, this::mapRow, argument);
        return rows.stream().findFirst();
    }

    private CommandRecord mapRow(ResultSet rs, int rowNumber) throws SQLException {
        String payload = rs.getString("payload");
        try {
            return new CommandRecord(
                rs.getObject("id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class),
                rs.getObject("order_id", UUID.class),
                rs.getString("status"),
                rs.getInt("attempt_count"),
                objectMapper.readValue(payload, DeliveryCommandMessage.class),
                rs.getObject("scheduled_sequence_number", Long.class),
                rs.getString("service_bus_message_id")
            );
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored delivery command payload is invalid", ex);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Delivery command payload could not be serialized", ex);
        }
    }

    private static String truncate(String value, int maximumLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maximumLength ? value : value.substring(0, maximumLength);
    }

    public record CommandRecord(
        UUID id,
        UUID chefSubOrderId,
        UUID orderId,
        String status,
        int attemptCount,
        DeliveryCommandMessage message,
        Long scheduledSequenceNumber,
        String serviceBusMessageId
    ) {}
}
