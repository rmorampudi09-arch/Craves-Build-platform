package in.craves.order.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationOutboxDispatcherRepository {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public NotificationOutboxDispatcherRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    // A PROCESSING row untouched this long belongs to a dispatcher that died; well above the HTTP read timeout.
    static final int STALE_PROCESSING_SECONDS = 300;

    public List<PendingNotificationOutboxEvent> findDue(int batchSize, int maxAttempts) {
        return jdbcTemplate.query(
            "SELECT id, event_key, event_type, user_identity_id, user_role, channel, template_code, title, body, target_type, target_id, payload::text AS payload_text, attempt_count " +
                "FROM order_schema.notification_outbox " +
                "WHERE attempt_count < ? AND (" +
                "(status IN ('PENDING', 'FAILED') AND next_attempt_at <= now()) " +
                "OR (status = 'PROCESSING' AND updated_at < now() - (? * INTERVAL '1 second'))) " +
                "ORDER BY next_attempt_at ASC, created_at ASC LIMIT ?",
            this::mapPending,
            maxAttempts,
            STALE_PROCESSING_SECONDS,
            batchSize
        );
    }

    // The claim takes a lease: updated_at marks when it was taken, and an expired lease can be reclaimed.
    public boolean markProcessing(UUID id) {
        return jdbcTemplate.update(
            "UPDATE order_schema.notification_outbox SET status = 'PROCESSING', attempt_count = attempt_count + 1, updated_at = now() " +
                "WHERE id = ? AND (status IN ('PENDING', 'FAILED') " +
                "OR (status = 'PROCESSING' AND updated_at < now() - (? * INTERVAL '1 second')))",
            id,
            STALE_PROCESSING_SECONDS
        ) == 1;
    }

    public void markSent(UUID id) {
        jdbcTemplate.update(
            "UPDATE order_schema.notification_outbox SET status = 'SENT', sent_at = now(), last_error = NULL, updated_at = now() " +
                "WHERE id = ? AND status = 'PROCESSING'",
            id
        );
    }

    public void markFailed(UUID id, String error, int retryDelaySeconds) {
        jdbcTemplate.update(
            "UPDATE order_schema.notification_outbox SET status = 'FAILED', last_error = ?, next_attempt_at = now() + (? * INTERVAL '1 second'), updated_at = now() " +
                "WHERE id = ? AND status = 'PROCESSING'",
            truncate(error, 1000),
            retryDelaySeconds,
            id
        );
    }

    /** Rows past the attempt limit (failed, or whose last lease expired) can never be sent: dead-letter them. */
    public int deadLetterExhausted(int maxAttempts) {
        return jdbcTemplate.update(
            "UPDATE order_schema.notification_outbox SET status = 'DEAD', " +
                "last_error = COALESCE(last_error, 'Delivery attempts exhausted; the last lease expired'), updated_at = now() " +
                "WHERE attempt_count >= ? AND (status = 'FAILED' " +
                "OR (status = 'PROCESSING' AND updated_at < now() - (? * INTERVAL '1 second')))",
            maxAttempts,
            STALE_PROCESSING_SECONDS
        );
    }

    private PendingNotificationOutboxEvent mapPending(ResultSet rs, int rowNum) throws SQLException {
        return new PendingNotificationOutboxEvent(
            rs.getObject("id", UUID.class),
            rs.getString("event_key"),
            rs.getString("event_type"),
            rs.getObject("user_identity_id", UUID.class),
            rs.getString("user_role"),
            rs.getString("channel"),
            rs.getString("template_code"),
            rs.getString("title"),
            rs.getString("body"),
            rs.getString("target_type"),
            rs.getObject("target_id", UUID.class),
            fromJson(rs.getString("payload_text")),
            rs.getInt("attempt_count")
        );
    }

    private Map<String, Object> fromJson(String payload) {
        try {
            return objectMapper.readValue(payload == null ? "{}" : payload, MAP_TYPE);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Notification outbox payload could not be deserialized", ex);
        }
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
