package in.craves.order.service;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class ChefAcceptanceWorkRepository {
    private final JdbcTemplate jdbcTemplate;

    public ChefAcceptanceWorkRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ReminderCandidate> findInitialNotificationCandidates(int batchSize) {
        return jdbcTemplate.query(
            """
                SELECT id, kitchen_id
                FROM order_schema.customer_order
                WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_requested_at IS NOT NULL
                  AND chef_acceptance_expires_at > now()
                  AND chef_acceptance_initial_recorded_at IS NULL
                ORDER BY chef_acceptance_requested_at ASC, id ASC
                LIMIT ?
                """,
            (resultSet, rowNumber) -> new ReminderCandidate(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("kitchen_id", UUID.class)
            ),
            batchSize
        );
    }

    public List<ReminderCandidate> findFirstReminderCandidates(int reminderMinutes, int batchSize) {
        return jdbcTemplate.query(
            """
                SELECT id, kitchen_id
                FROM order_schema.customer_order
                WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_requested_at IS NOT NULL
                  AND chef_acceptance_expires_at > now()
                  AND chef_acceptance_initial_recorded_at IS NOT NULL
                  AND chef_acceptance_reminder_10_recorded_at IS NULL
                  AND chef_acceptance_requested_at <= now() - (? * INTERVAL '1 minute')
                ORDER BY chef_acceptance_requested_at ASC, id ASC
                LIMIT ?
                """,
            (resultSet, rowNumber) -> new ReminderCandidate(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("kitchen_id", UUID.class)
            ),
            reminderMinutes,
            batchSize
        );
    }

    public List<ReminderCandidate> findSecondReminderCandidates(int reminderMinutes, int batchSize) {
        return jdbcTemplate.query(
            """
                SELECT id, kitchen_id
                FROM order_schema.customer_order
                WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_requested_at IS NOT NULL
                  AND chef_acceptance_expires_at > now()
                  AND chef_acceptance_reminder_10_recorded_at IS NOT NULL
                  AND chef_acceptance_reminder_20_recorded_at IS NULL
                  AND chef_acceptance_requested_at <= now() - (? * INTERVAL '1 minute')
                ORDER BY chef_acceptance_requested_at ASC, id ASC
                LIMIT ?
                """,
            (resultSet, rowNumber) -> new ReminderCandidate(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("kitchen_id", UUID.class)
            ),
            reminderMinutes,
            batchSize
        );
    }

    @Transactional
    public List<UUID> claimExpiredOrderIds(int batchSize, int staleClaimSeconds, UUID claimToken) {
        return jdbcTemplate.query(
            """
                WITH candidates AS (
                    SELECT id
                    FROM order_schema.customer_order
                    WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                      AND chef_acceptance_expires_at IS NOT NULL
                      AND chef_acceptance_expires_at <= now()
                      AND (
                          chef_acceptance_timeout_claim_token IS NULL
                          OR chef_acceptance_timeout_claimed_at IS NULL
                          OR chef_acceptance_timeout_claimed_at < now() - (? * INTERVAL '1 second')
                      )
                    ORDER BY chef_acceptance_expires_at ASC, id ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT ?
                )
                UPDATE order_schema.customer_order order_row
                SET chef_acceptance_timeout_claim_token = ?,
                    chef_acceptance_timeout_claimed_at = now(),
                    chef_acceptance_timeout_attempt_count = chef_acceptance_timeout_attempt_count + 1,
                    chef_acceptance_timeout_last_error = NULL,
                    updated_at = now()
                FROM candidates
                WHERE order_row.id = candidates.id
                RETURNING order_row.id
                """,
            (resultSet, rowNumber) -> resultSet.getObject("id", UUID.class),
            staleClaimSeconds,
            batchSize,
            claimToken
        );
    }

    public boolean releaseTimeoutClaim(UUID orderId, UUID claimToken, String error) {
        return jdbcTemplate.update(
            """
                UPDATE order_schema.customer_order
                SET chef_acceptance_timeout_claim_token = NULL,
                    chef_acceptance_timeout_claimed_at = NULL,
                    chef_acceptance_timeout_last_error = ?,
                    updated_at = now()
                WHERE id = ?
                  AND status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_timeout_claim_token = ?
                """,
            safeError(error),
            orderId,
            claimToken
        ) == 1;
    }

    private static String safeError(String error) {
        if (error == null || error.isBlank()) {
            return "Unknown timeout processing failure";
        }
        String normalized = error.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 1000 ? normalized.substring(0, 1000) : normalized;
    }

    public record ReminderCandidate(UUID orderId, UUID kitchenId) {
    }
}
