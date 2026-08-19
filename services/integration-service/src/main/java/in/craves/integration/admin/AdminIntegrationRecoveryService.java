package in.craves.integration.admin;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminIntegrationRecoveryService {
    private final JdbcTemplate jdbcTemplate;
    private final MeterRegistry meterRegistry;

    public AdminIntegrationRecoveryService(JdbcTemplate jdbcTemplate, MeterRegistry meterRegistry) {
        this.jdbcTemplate = jdbcTemplate;
        this.meterRegistry = meterRegistry;
    }

    @Transactional
    public DeadLetterSnapshot investigate(
        RecoverySource source,
        UUID id,
        UUID actorIdentityId,
        String reason,
        UUID correlationId
    ) {
        DeadLetterSnapshot snapshot = load(source, id, false);
        audit(actorIdentityId, source, id, "INVESTIGATE_DEAD_LETTER", reason, correlationId);
        return snapshot;
    }

    @Transactional
    public ReplayResponse replay(
        RecoverySource source,
        UUID id,
        UUID actorIdentityId,
        String reason,
        UUID correlationId
    ) {
        DeadLetterSnapshot before = load(source, id, true);
        if (!"DEAD_LETTER".equals(before.processingStatus())) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Only terminal DEAD_LETTER webhook events can be replayed"
            );
        }

        int updated = switch (source) {
            case CASHFREE -> jdbcTemplate.update("""
                UPDATE payment_schema.cashfree_webhook_delivery
                   SET processing_status = 'RECEIVED',
                       next_attempt_at = now(),
                       attempt_count = 0,
                       lock_token = NULL,
                       processing_started_at = NULL,
                       completed_at = NULL,
                       last_error = NULL
                 WHERE id = ?
                   AND processing_status = 'DEAD_LETTER'
                """, id);
            case DELIVERY -> jdbcTemplate.update("""
                UPDATE delivery_schema.delivery_webhook_inbox
                   SET processing_status = 'RECEIVED',
                       next_attempt_at = now(),
                       attempt_count = 0,
                       processing_started_at = NULL,
                       processed_at = NULL,
                       error_message = NULL,
                       delivery_job_id = NULL,
                       provider_order_id = NULL,
                       provider_delivery_id = NULL,
                       normalized_status = NULL,
                       processing_result = NULL
                 WHERE id = ?
                   AND processing_status = 'DEAD_LETTER'
                """, id);
        };
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Webhook dead-letter state changed before replay");
        }

        audit(actorIdentityId, source, id, "REPLAY_DEAD_LETTER", reason, correlationId);
        meterRegistry.counter(
            "craves.integration.recovery.replay",
            "source", source.name().toLowerCase(Locale.ROOT),
            "outcome", "accepted"
        ).increment();
        return new ReplayResponse(
            source,
            id,
            "RECEIVED",
            0,
            correlationId,
            OffsetDateTime.now()
        );
    }

    private DeadLetterSnapshot load(RecoverySource source, UUID id, boolean lock) {
        String suffix = lock ? " FOR UPDATE" : "";
        return switch (source) {
            case CASHFREE -> jdbcTemplate.query(
                """
                SELECT id,
                       'cashfree' AS provider_id,
                       idempotency_key AS event_identity,
                       processing_status,
                       attempt_count,
                       next_attempt_at,
                       first_seen_at AS received_at,
                       completed_at AS processed_at,
                       last_error AS error_message
                  FROM payment_schema.cashfree_webhook_delivery
                 WHERE id = ?
                """ + suffix,
                (rs, rowNum) -> new DeadLetterSnapshot(
                    RecoverySource.CASHFREE,
                    rs.getObject("id", UUID.class),
                    rs.getString("provider_id"),
                    rs.getString("event_identity"),
                    rs.getString("processing_status"),
                    rs.getInt("attempt_count"),
                    rs.getObject("next_attempt_at", OffsetDateTime.class),
                    rs.getObject("received_at", OffsetDateTime.class),
                    rs.getObject("processed_at", OffsetDateTime.class),
                    safeError(rs.getString("error_message"))
                ),
                id
            ).stream().findFirst().orElseThrow(() -> notFound(source));
            case DELIVERY -> jdbcTemplate.query(
                """
                SELECT id,
                       provider_id,
                       provider_event_id AS event_identity,
                       processing_status,
                       attempt_count,
                       next_attempt_at,
                       received_at,
                       processed_at,
                       error_message
                  FROM delivery_schema.delivery_webhook_inbox
                 WHERE id = ?
                """ + suffix,
                (rs, rowNum) -> new DeadLetterSnapshot(
                    RecoverySource.DELIVERY,
                    rs.getObject("id", UUID.class),
                    rs.getString("provider_id"),
                    rs.getString("event_identity"),
                    rs.getString("processing_status"),
                    rs.getInt("attempt_count"),
                    rs.getObject("next_attempt_at", OffsetDateTime.class),
                    rs.getObject("received_at", OffsetDateTime.class),
                    rs.getObject("processed_at", OffsetDateTime.class),
                    safeError(rs.getString("error_message"))
                ),
                id
            ).stream().findFirst().orElseThrow(() -> notFound(source));
        };
    }

    private void audit(
        UUID actorIdentityId,
        RecoverySource source,
        UUID resourceId,
        String action,
        String reason,
        UUID correlationId
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO payment_schema.admin_investigation_audit
                (id, actor_identity_id, resource_type, resource_id, action, reason, correlation_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, now())
            """,
            UUID.randomUUID(),
            actorIdentityId,
            source == RecoverySource.CASHFREE ? "CASHFREE_WEBHOOK" : "DELIVERY_WEBHOOK",
            resourceId,
            action,
            reason,
            correlationId
        );
    }

    private static ResponseStatusException notFound(RecoverySource source) {
        return new ResponseStatusException(
            HttpStatus.NOT_FOUND,
            source.name() + " webhook recovery item was not found"
        );
    }

    private static String safeError(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() <= 500 ? normalized : normalized.substring(0, 500);
    }

    public enum RecoverySource {
        CASHFREE,
        DELIVERY;

        public static RecoverySource parse(String value) {
            try {
                return RecoverySource.valueOf(value.trim().toUpperCase(Locale.ROOT));
            } catch (Exception exception) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Recovery source must be CASHFREE or DELIVERY"
                );
            }
        }
    }

    public record DeadLetterSnapshot(
        RecoverySource source,
        UUID id,
        String providerId,
        String eventIdentity,
        String processingStatus,
        int attemptCount,
        OffsetDateTime nextAttemptAt,
        OffsetDateTime receivedAt,
        OffsetDateTime processedAt,
        String lastError
    ) {}

    public record ReplayResponse(
        RecoverySource source,
        UUID id,
        String processingStatus,
        int attemptCount,
        UUID correlationId,
        OffsetDateTime replayAcceptedAt
    ) {}
}
