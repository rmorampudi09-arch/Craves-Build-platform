package in.craves.integration.delivery.command;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class BorzoPidgeHandoffRepository {
    private final JdbcTemplate jdbc;

    public BorzoPidgeHandoffRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void enroll(UUID deliveryJobId, String borzoOrderId, Instant borzoWindowStartedAt) {
        Instant startedAt = Objects.requireNonNull(
            borzoWindowStartedAt, "Borzo selection window start is required");
        Instant dueAt = startedAt.plusSeconds(120);
        jdbc.update("""
            INSERT INTO delivery_schema.delivery_borzo_pidge_handoff
                (delivery_job_id, borzo_provider_delivery_id, started_at, due_at,
                 next_attempt_at)
            VALUES (?, ?, ?, ?, GREATEST(?, now()))
            ON CONFLICT (delivery_job_id) DO NOTHING
            """, deliveryJobId, borzoOrderId, timestamp(startedAt),
            timestamp(dueAt), timestamp(dueAt));
    }

    @Transactional
    public List<Handoff> claimDue(int limit) {
        return jdbc.query("""
            WITH due AS (
                SELECT delivery_job_id
                FROM delivery_schema.delivery_borzo_pidge_handoff
                WHERE state IN ('WAITING', 'PROCESSING_BORZO', 'BORZO_CANCELLED',
                                'PROCESSING_PIDGE', 'PIDGE_RECONCILIATION_PENDING')
                  AND next_attempt_at <= now()
                  AND (lease_until IS NULL OR lease_until < now())
                ORDER BY next_attempt_at, started_at
                FOR UPDATE SKIP LOCKED
                LIMIT ?
            )
            UPDATE delivery_schema.delivery_borzo_pidge_handoff AS handoff
            SET state = CASE
                    WHEN handoff.state IN ('WAITING', 'PROCESSING_BORZO')
                    THEN 'PROCESSING_BORZO' ELSE 'PROCESSING_PIDGE' END,
                attempt_count = handoff.attempt_count + 1,
                lease_until = now() + interval '5 minutes',
                updated_at = now()
            FROM due
            WHERE handoff.delivery_job_id = due.delivery_job_id
            RETURNING handoff.delivery_job_id, handoff.borzo_provider_delivery_id,
                      handoff.state, handoff.attempt_count, handoff.due_at,
                      handoff.borzo_cancelled_at, handoff.borzo_cancel_intent_at
            """, this::mapHandoff, limit);
    }

    public Optional<Handoff> findByBorzoOrderId(String borzoOrderId) {
        return jdbc.query("""
            SELECT delivery_job_id, borzo_provider_delivery_id, state, attempt_count, due_at,
                   borzo_cancelled_at, borzo_cancel_intent_at
            FROM delivery_schema.delivery_borzo_pidge_handoff
            WHERE borzo_provider_delivery_id = ?
            """, this::mapHandoff, borzoOrderId).stream().findFirst();
    }

    public Optional<Handoff> findByDeliveryJobId(UUID deliveryJobId) {
        return jdbc.query("""
            SELECT delivery_job_id, borzo_provider_delivery_id, state, attempt_count, due_at,
                   borzo_cancelled_at, borzo_cancel_intent_at
            FROM delivery_schema.delivery_borzo_pidge_handoff
            WHERE delivery_job_id = ?
            """, this::mapHandoff, deliveryJobId).stream().findFirst();
    }

    /** Used inside status-update transactions to serialize callbacks with the worker claim. */
    public Optional<Handoff> lockByBorzoOrderId(String borzoOrderId) {
        return jdbc.query("""
            SELECT delivery_job_id, borzo_provider_delivery_id, state, attempt_count, due_at,
                   borzo_cancelled_at, borzo_cancel_intent_at
            FROM delivery_schema.delivery_borzo_pidge_handoff
            WHERE borzo_provider_delivery_id = ? FOR UPDATE
            """, this::mapHandoff, borzoOrderId).stream().findFirst();
    }

    public boolean markRetained(UUID deliveryJobId) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_borzo_pidge_handoff
            SET state = 'RETAINED_BORZO', lease_until = NULL, next_attempt_at = now(),
                completed_at = now(), updated_at = now(), last_error = NULL
            WHERE delivery_job_id = ? AND state IN ('WAITING', 'MANUAL_REVIEW')
              AND borzo_cancelled_at IS NULL
            """, deliveryJobId) == 1;
    }

    public boolean markRetainedByWorker(UUID deliveryJobId) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_borzo_pidge_handoff
            SET state = 'RETAINED_BORZO', lease_until = NULL, next_attempt_at = now(),
                completed_at = now(), updated_at = now(), last_error = NULL
            WHERE delivery_job_id = ? AND state = 'PROCESSING_BORZO'
            """, deliveryJobId) == 1;
    }

    public boolean markBorzoCancelled(UUID deliveryJobId) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_borzo_pidge_handoff
            SET state = 'BORZO_CANCELLED', borzo_cancelled_at = now(), lease_until = NULL,
                next_attempt_at = now(), updated_at = now(), last_error = NULL
            WHERE delivery_job_id = ? AND state = 'PROCESSING_BORZO'
            """, deliveryJobId) == 1;
    }

    /** Durable intent makes a lost cancellation response recoverable without blind booking. */
    public boolean markCancelIntent(UUID deliveryJobId) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_borzo_pidge_handoff
            SET borzo_cancel_intent_at = COALESCE(borzo_cancel_intent_at, now()),
                updated_at = now()
            WHERE delivery_job_id = ? AND state = 'PROCESSING_BORZO'
            """, deliveryJobId) == 1;
    }

    public void retry(UUID deliveryJobId, String processingState, Instant nextAttemptAt,
                      String message) {
        String nextState = "PROCESSING_BORZO".equals(processingState)
            ? "WAITING" : "BORZO_CANCELLED";
        jdbc.update("""
            UPDATE delivery_schema.delivery_borzo_pidge_handoff
            SET state = ?, lease_until = NULL, next_attempt_at = ?,
                last_error = ?, updated_at = now()
            WHERE delivery_job_id = ? AND state = ?
            """, nextState, timestamp(nextAttemptAt), truncate(message), deliveryJobId,
            processingState);
    }

    public void manualReview(UUID deliveryJobId, String message) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_borzo_pidge_handoff
            SET state = 'MANUAL_REVIEW', lease_until = NULL, last_error = ?, updated_at = now()
            WHERE delivery_job_id = ? AND state IN ('PROCESSING_BORZO', 'PROCESSING_PIDGE')
            """, truncate(message), deliveryJobId);
    }

    public boolean complete(UUID deliveryJobId, String pidgeOrderId) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_borzo_pidge_handoff
            SET state = 'COMPLETED', pidge_provider_delivery_id = ?,
                lease_until = NULL, completed_at = now(), last_error = NULL, updated_at = now()
            WHERE delivery_job_id = ? AND state = 'PROCESSING_PIDGE'
            """, pidgeOrderId, deliveryJobId) == 1;
    }

    private Handoff mapHandoff(ResultSet rs, int rowNumber) throws SQLException {
        return new Handoff(
            rs.getObject("delivery_job_id", UUID.class),
            rs.getString("borzo_provider_delivery_id"),
            rs.getString("state"),
            rs.getInt("attempt_count"),
            rs.getObject("due_at", OffsetDateTime.class).toInstant(),
            rs.getObject("borzo_cancelled_at", OffsetDateTime.class) != null,
            rs.getObject("borzo_cancel_intent_at", OffsetDateTime.class) != null
        );
    }

    private static OffsetDateTime timestamp(Instant value) {
        return value.atOffset(ZoneOffset.UTC);
    }

    private static String truncate(String value) {
        String safe = value == null ? "Handoff retry required" : value.replace('\n', ' ').replace('\r', ' ');
        return safe.length() <= 1000 ? safe : safe.substring(0, 1000);
    }

    public record Handoff(UUID deliveryJobId, String borzoProviderDeliveryId,
                          String state, int attemptCount, Instant dueAt,
                          boolean borzoCancelled, boolean cancelIntentRecorded) {}
}
