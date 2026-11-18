package in.craves.integration.delivery.status;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class DeliveryStatusRepository {
    /** opened_by of a case no person opened. */
    static final UUID SYSTEM_ACTOR = new UUID(0L, 0L);
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public DeliveryStatusRepository(JdbcTemplate jdbc,
                                    ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public List<WebhookWorkItem> claimWebhookBatch(int limit,
                                                   int staleMinutes,
                                                   int maxAttempts) {
        return jdbc.query("""
            WITH selected AS (
                SELECT id
                FROM delivery_schema.delivery_webhook_inbox
                WHERE (
                        processing_status IN ('RECEIVED', 'FAILED')
                        AND next_attempt_at <= now()
                        AND attempt_count < ?
                      )
                   OR (
                        processing_status = 'PROCESSING'
                        AND processing_started_at < now() - make_interval(mins => ?)
                        AND attempt_count < ?
                      )
                ORDER BY received_at
                FOR UPDATE SKIP LOCKED
                LIMIT ?
            )
            UPDATE delivery_schema.delivery_webhook_inbox AS inbox
            SET processing_status = 'PROCESSING',
                attempt_count = attempt_count + 1,
                processing_started_at = now(),
                error_message = NULL
            FROM selected
            WHERE inbox.id = selected.id
            RETURNING inbox.id,
                      inbox.provider_id,
                      inbox.provider_event_id,
                      inbox.raw_payload,
                      inbox.attempt_count
            """,
            this::mapWebhook,
            maxAttempts,
            staleMinutes,
            maxAttempts,
            limit
        );
    }

    public Optional<DeliveryJobState> findJobByProviderOrder(String providerId,
                                                             String providerOrderId) {
        return jdbc.query("""
            SELECT id,
                   order_id,
                   chef_sub_order_id,
                   provider_id,
                   provider_delivery_id,
                   status,
                   provider_status,
                   tracking_url,
                   last_status_observed_at
            FROM delivery_schema.delivery_job
            WHERE provider_id = lower(?)
              AND provider_delivery_id = ?
            """,
            this::mapJob,
            providerId,
            providerOrderId
        ).stream().findFirst();
    }

    public Optional<DeliveryJobState> lockJob(UUID deliveryJobId) {
        return jdbc.query("""
            SELECT id,
                   order_id,
                   chef_sub_order_id,
                   provider_id,
                   provider_delivery_id,
                   status,
                   provider_status,
                   tracking_url,
                   last_status_observed_at
            FROM delivery_schema.delivery_job
            WHERE id = ?
            FOR UPDATE
            """,
            this::mapJob,
            deliveryJobId
        ).stream().findFirst();
    }

    public boolean insertEventIfAbsent(UUID deliveryJobId,
                                       String providerId,
                                       String providerEventId,
                                       String eventType,
                                       String source,
                                       String normalizedStatus,
                                       String providerStatus,
                                       JsonNode payload,
                                       Instant occurredAt,
                                       boolean applied,
                                       String ignoredReason) {
        int inserted = jdbc.update("""
            INSERT INTO delivery_schema.delivery_event
                (id,
                 delivery_job_id,
                 provider_id,
                 provider_event_id,
                 event_type,
                 normalized_status,
                 provider_status,
                 source,
                 payload,
                 occurred_at,
                 applied,
                 ignored_reason,
                 created_at)
            VALUES (?, ?, lower(?), ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, now())
            ON CONFLICT (provider_id, provider_event_id) DO NOTHING
            """,
            UUID.randomUUID(),
            deliveryJobId,
            providerId,
            providerEventId,
            eventType,
            normalizedStatus,
            providerStatus,
            source,
            payload.toString(),
            databaseTimestamp(occurredAt),
            applied,
            ignoredReason
        );
        return inserted == 1;
    }

    public void applyJobStatus(UUID deliveryJobId,
                               String normalizedStatus,
                               String providerStatus,
                               String trackingUrl,
                               Instant observedAt,
                               String source,
                               Instant nextTrackingAt) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_job
            SET status = ?,
                provider_status = ?,
                tracking_url = COALESCE(NULLIF(?, ''), tracking_url),
                last_status_observed_at = ?,
                last_status_source = ?,
                picked_up_at = CASE
                    WHEN ? IN ('PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF', 'DELIVERED')
                         AND picked_up_at IS NULL
                    THEN ?
                    ELSE picked_up_at
                END,
                delivered_at = CASE
                    WHEN ? = 'DELIVERED' AND delivered_at IS NULL
                    THEN ?
                    ELSE delivered_at
                END,
                next_tracking_at = ?,
                tracking_attempt_count = 0,
                tracking_processing_started_at = NULL,
                tracking_dead_lettered_at = NULL,
                last_tracking_error = NULL,
                updated_at = now()
            WHERE id = ?
            """,
            normalizedStatus,
            providerStatus,
            trackingUrl,
            databaseTimestamp(observedAt),
            source,
            normalizedStatus,
            databaseTimestamp(observedAt),
            normalizedStatus,
            databaseTimestamp(observedAt),
            databaseTimestamp(nextTrackingAt),
            deliveryJobId
        );
    }

    /**
     * Rank guard only: runs the guard's own statements so that one failing cannot abort the caller's transaction. In a
     * transaction they run in a savepoint, rolled back to before the failure is rethrown; outside one they just run.
     */
    public <T> T inSavepoint(Supplier<T> statements) {
        return jdbc.execute((ConnectionCallback<T>) connection -> {
            if (connection.getAutoCommit()) {
                return statements.get();
            }
            Savepoint savepoint = connection.setSavepoint();
            try {
                T result = statements.get();
                connection.releaseSavepoint(savepoint);
                return result;
            } catch (RuntimeException failure) {
                connection.rollback(savepoint);
                throw failure;
            }
        });
    }

    /** Rank guard only: whether the job's parcel was ever picked up (a DELAYED job no longer says which stage it reached). */
    public boolean pickedUp(UUID deliveryJobId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
            "SELECT picked_up_at IS NOT NULL FROM delivery_schema.delivery_job WHERE id = ?", Boolean.class, deliveryJobId));
    }

    /** Rank guard only: Craves cancels this booking itself (courier_cancel), or order-service cancelled its order. */
    public boolean cravesEndedBooking(String providerId, String providerDeliveryId, UUID chefSubOrderId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM delivery_schema.courier_cancel WHERE provider_id = lower(?) AND provider_delivery_id = ?)
                OR EXISTS (SELECT 1 FROM delivery_schema.order_cancelled WHERE chef_sub_order_id = ?)
            """, Boolean.class, providerId, providerDeliveryId, chefSubOrderId));
    }

    /**
     * Rank guard only: an ops case (PROVIDER_CANCELLED) for a job its courier ended, opened by the system. False when the
     * job already has an active case.
     */
    public boolean openCourierEndedCase(UUID deliveryJobId, UUID orderId, String note) {
        UUID caseId = UUID.randomUUID();
        if (jdbc.update("""
            INSERT INTO delivery_schema.delivery_exception_case (id, delivery_job_id, order_id, reason, status, opened_by)
            VALUES (?, ?, ?, 'PROVIDER_CANCELLED', 'OPEN', ?)
            ON CONFLICT (delivery_job_id) WHERE status NOT IN ('RESOLVED', 'DISMISSED') DO NOTHING
            """, caseId, deliveryJobId, orderId, SYSTEM_ACTOR) != 1) {
            return false;
        }
        jdbc.update("INSERT INTO delivery_schema.delivery_exception_event (case_id, action, status, actor_id, note) "
            + "VALUES (?, 'OPEN', 'OPEN', ?, ?)", caseId, SYSTEM_ACTOR, note);
        return true;
    }

    public void markWebhookProcessed(UUID inboxId,
                                     UUID deliveryJobId,
                                     String providerOrderId,
                                     String providerDeliveryId,
                                     String normalizedStatus,
                                     String processingResult) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_webhook_inbox
            SET processing_status = 'PROCESSED',
                delivery_job_id = ?,
                provider_order_id = ?,
                provider_delivery_id = ?,
                normalized_status = ?,
                processing_result = ?,
                processing_started_at = NULL,
                error_message = NULL,
                processed_at = now()
            WHERE id = ?
            """,
            deliveryJobId,
            providerOrderId,
            providerDeliveryId,
            normalizedStatus,
            processingResult,
            inboxId
        );
    }

    public void deferWebhookForHandoff(UUID inboxId) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_webhook_inbox
            SET processing_status = 'FAILED', next_attempt_at = now() + interval '3 seconds',
                attempt_count = GREATEST(0, attempt_count - 1),
                processing_started_at = NULL, processing_result = 'HANDOFF_DECISION_PENDING',
                error_message = NULL
            WHERE id = ? AND processing_status = 'PROCESSING'
            """, inboxId);
    }

    /**
     * The callback's booking is still being recorded or resolved (CourierStrayBookings): tried again later without
     * counting this attempt. False once the callback is older than maxAgeMinutes, so that it ends like any other.
     */
    public boolean parkWebhook(UUID inboxId, int retrySeconds, int maxAgeMinutes) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_webhook_inbox
            SET processing_status = 'FAILED', next_attempt_at = now() + make_interval(secs => ?),
                attempt_count = GREATEST(0, attempt_count - 1),
                processing_started_at = NULL, processing_result = 'BOOKING_NOT_ON_RECORD',
                error_message = NULL
            WHERE id = ? AND processing_status = 'PROCESSING' AND received_at > now() - make_interval(mins => ?)
            """, retrySeconds, inboxId, maxAgeMinutes) == 1;
    }

    /**
     * A claimed callback nobody could take now: due again after the delay, so that it leaves the head of the inbox, and
     * the claim is not counted as an attempt. Only for the claim made as attempt attemptCount.
     */
    public void releaseWebhook(UUID inboxId, int attemptCount, int delaySeconds) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_webhook_inbox
            SET processing_status = 'FAILED', next_attempt_at = now() + make_interval(secs => ?),
                attempt_count = GREATEST(0, attempt_count - 1),
                processing_started_at = NULL, error_message = NULL
            WHERE id = ? AND processing_status = 'PROCESSING' AND attempt_count = ?
            """, delaySeconds, inboxId, attemptCount);
    }

    /** In a transaction: locks the inbox row if the claim made as attempt attemptCount still holds it. */
    public boolean lockWebhookClaim(UUID inboxId, int attemptCount) {
        return !jdbc.queryForList("""
            SELECT 1 FROM delivery_schema.delivery_webhook_inbox
            WHERE id = ? AND processing_status = 'PROCESSING' AND attempt_count = ?
            FOR UPDATE
            """, inboxId, attemptCount).isEmpty();
    }

    public void markWebhookDuplicate(UUID inboxId,
                                     String processingResult) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_webhook_inbox
            SET processing_status = 'DUPLICATE',
                processing_result = ?,
                processing_started_at = NULL,
                error_message = NULL,
                processed_at = now()
            WHERE id = ?
            """,
            processingResult,
            inboxId
        );
    }

    public void markWebhookFailed(UUID inboxId,
                                  int attemptCount,
                                  int maxAttempts,
                                  Instant nextAttemptAt,
                                  String safeError) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_webhook_inbox
            SET processing_status = CASE
                    WHEN ? >= ? THEN 'DEAD_LETTER'
                    ELSE 'FAILED'
                END,
                next_attempt_at = ?,
                processing_started_at = NULL,
                error_message = ?,
                processed_at = CASE
                    WHEN ? >= ? THEN now()
                    ELSE NULL
                END
            WHERE id = ?
            """,
            attemptCount,
            maxAttempts,
            databaseTimestamp(nextAttemptAt),
            truncate(safeError, 2000),
            attemptCount,
            maxAttempts,
            inboxId
        );
    }

    @Transactional
    public List<TrackingWorkItem> claimTrackingBatch(int limit,
                                                     int staleMinutes,
                                                     int maxAttempts) {
        return jdbc.query("""
            WITH selected AS (
                SELECT id
                FROM delivery_schema.delivery_job
                WHERE status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED')
                  AND tracking_attempt_count < ?
                  AND tracking_dead_lettered_at IS NULL
                  AND (
                        (
                          next_tracking_at IS NOT NULL
                          AND next_tracking_at <= now()
                          AND tracking_processing_started_at IS NULL
                        )
                     OR (
                          tracking_processing_started_at
                              < now() - make_interval(mins => ?)
                        )
                  )
                ORDER BY next_tracking_at NULLS FIRST, updated_at
                FOR UPDATE SKIP LOCKED
                LIMIT ?
            )
            UPDATE delivery_schema.delivery_job AS job
            SET tracking_attempt_count = tracking_attempt_count + 1,
                tracking_processing_started_at = now(),
                last_tracking_error = NULL,
                updated_at = now()
            FROM selected
            WHERE job.id = selected.id
            RETURNING job.id,
                      job.order_id,
                      job.chef_sub_order_id,
                      job.provider_id,
                      job.provider_delivery_id,
                      job.tracking_attempt_count
            """,
            this::mapTracking,
            maxAttempts,
            staleMinutes,
            limit
        );
    }

    public void markTrackingNoChange(UUID deliveryJobId,
                                     Instant nextTrackingAt) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_job
            SET next_tracking_at = ?,
                tracking_attempt_count = 0,
                tracking_processing_started_at = NULL,
                tracking_dead_lettered_at = NULL,
                last_tracking_error = NULL,
                updated_at = now()
            WHERE id = ?
            """,
            databaseTimestamp(nextTrackingAt),
            deliveryJobId
        );
    }

    /**
     * Webhook-first tracking only: a callback for the job was heard at now, so its next poll is quietSeconds from now,
     * but never later than safetySeconds after its last poll (after its creation, when never polled). A job that is
     * final, dead-lettered, being polled or waiting to retry a failed poll keeps its schedule.
     */
    public int deferTrackingAfterCallback(UUID deliveryJobId, Instant now, long quietSeconds, long safetySeconds) {
        return jdbc.update("""
            UPDATE delivery_schema.delivery_job
            SET last_webhook_at = ?,
                next_tracking_at = CASE
                    WHEN next_tracking_at IS NOT NULL AND tracking_attempt_count = 0
                    THEN LEAST(?::timestamptz + make_interval(secs => ?),
                               COALESCE(last_polled_at, created_at) + make_interval(secs => ?))
                    ELSE next_tracking_at
                END
            WHERE id = ?
            """, databaseTimestamp(now), databaseTimestamp(now), (double) quietSeconds, (double) safetySeconds, deliveryJobId);
    }

    /** Webhook-first tracking only: the courier answered a poll for the job at now. */
    public void markTrackingPolled(UUID deliveryJobId, Instant now) {
        jdbc.update("UPDATE delivery_schema.delivery_job SET last_polled_at = ? WHERE id = ?", databaseTimestamp(now), deliveryJobId);
    }

    public void markTrackingFailed(UUID deliveryJobId,
                                   int attemptCount,
                                   int maxAttempts,
                                   Instant nextTrackingAt,
                                   String safeError) {
        jdbc.update("""
            UPDATE delivery_schema.delivery_job
            SET next_tracking_at = CASE
                    WHEN ? >= ? THEN NULL
                    ELSE ?
                END,
                tracking_processing_started_at = NULL,
                tracking_dead_lettered_at = CASE
                    WHEN ? >= ? THEN now()
                    ELSE NULL
                END,
                last_tracking_error = ?,
                updated_at = now()
            WHERE id = ?
            """,
            attemptCount,
            maxAttempts,
            databaseTimestamp(nextTrackingAt),
            attemptCount,
            maxAttempts,
            truncate(safeError, 2000),
            deliveryJobId
        );
    }

    private WebhookWorkItem mapWebhook(ResultSet rs,
                                       int rowNumber) throws SQLException {
        return new WebhookWorkItem(
            rs.getObject("id", UUID.class),
            rs.getString("provider_id"),
            rs.getString("provider_event_id"),
            readJson(rs.getString("raw_payload")),
            rs.getInt("attempt_count")
        );
    }

    private DeliveryJobState mapJob(ResultSet rs,
                                    int rowNumber) throws SQLException {
        OffsetDateTime observedAt = rs.getObject(
            "last_status_observed_at",
            OffsetDateTime.class
        );
        return new DeliveryJobState(
            rs.getObject("id", UUID.class),
            rs.getObject("order_id", UUID.class),
            rs.getObject("chef_sub_order_id", UUID.class),
            rs.getString("provider_id"),
            rs.getString("provider_delivery_id"),
            rs.getString("status"),
            rs.getString("provider_status"),
            rs.getString("tracking_url"),
            observedAt == null ? null : observedAt.toInstant()
        );
    }

    private TrackingWorkItem mapTracking(ResultSet rs,
                                         int rowNumber) throws SQLException {
        return new TrackingWorkItem(
            rs.getObject("id", UUID.class),
            rs.getObject("order_id", UUID.class),
            rs.getObject("chef_sub_order_id", UUID.class),
            rs.getString("provider_id"),
            rs.getString("provider_delivery_id"),
            rs.getInt("tracking_attempt_count")
        );
    }

    private JsonNode readJson(String value) throws SQLException {
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException ex) {
            throw new SQLException("Stored webhook payload is invalid JSON", ex);
        }
    }

    static OffsetDateTime databaseTimestamp(Instant value) {
        return value == null ? null : value.atOffset(ZoneOffset.UTC);
    }

    private static String truncate(String value,
                                   int maximumLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maximumLength
            ? value
            : value.substring(0, maximumLength);
    }

    public record WebhookWorkItem(
        UUID id,
        String providerId,
        String providerEventId,
        JsonNode rawPayload,
        int attemptCount
    ) {}

    public record DeliveryJobState(
        UUID id,
        UUID orderId,
        UUID chefSubOrderId,
        String providerId,
        String providerDeliveryId,
        String status,
        String providerStatus,
        String trackingUrl,
        Instant lastStatusObservedAt
    ) {}

    public record TrackingWorkItem(
        UUID deliveryJobId,
        UUID orderId,
        UUID chefSubOrderId,
        String providerId,
        String providerDeliveryId,
        int attemptCount
    ) {}
}
