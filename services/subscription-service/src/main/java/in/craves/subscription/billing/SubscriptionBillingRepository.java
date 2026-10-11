package in.craves.subscription.billing;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class SubscriptionBillingRepository {
    /** failure_code of an unpaid invoice whose cycle started during a pause; read by the payment-status consumer. */
    public static final String PAUSE_VOIDED = "PAUSED_CYCLE_VOIDED";

    private final JdbcTemplate jdbcTemplate;

    public SubscriptionBillingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public List<BillingClaim> claimDue(int horizonDays, int staleLockMinutes, int batchSize) {
        UUID lockToken = UUID.randomUUID();
        String sql = """
            WITH candidates AS (
                SELECT cs.id
                  FROM subscription_schema.customer_subscription cs
                  JOIN subscription_schema.subscription_plan sp ON sp.id = cs.plan_id
                 WHERE cs.status IN ('PENDING_PAYMENT', 'ACTIVE', 'PAYMENT_FAILED')
                   AND cs.next_billing_date IS NOT NULL
                   AND cs.next_billing_date <= current_date + ?
                   AND sp.status = 'ACTIVE'
                   AND (cs.billing_lock_token IS NULL OR cs.billing_locked_at < now() - (? * INTERVAL '1 minute'))
                 ORDER BY cs.next_billing_date, cs.created_at
                 FOR UPDATE OF cs SKIP LOCKED
                 LIMIT ?
            )
            UPDATE subscription_schema.customer_subscription cs
               SET billing_lock_token = ?, billing_locked_at = now()
              FROM candidates c, subscription_schema.subscription_plan sp
             WHERE cs.id = c.id
               AND sp.id = cs.plan_id
            RETURNING cs.id, cs.customer_identity_id, cs.plan_id, cs.chef_identity_id,
                      cs.next_billing_date, sp.billing_period, sp.amount, sp.currency
            """;
        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> new BillingClaim(
                rs.getObject("id", UUID.class),
                rs.getObject("customer_identity_id", UUID.class),
                rs.getObject("plan_id", UUID.class),
                rs.getObject("chef_identity_id", UUID.class),
                rs.getObject("next_billing_date", LocalDate.class),
                rs.getString("billing_period"),
                rs.getBigDecimal("amount"),
                rs.getString("currency"),
                lockToken
            ),
            horizonDays, staleLockMinutes, batchSize, lockToken
        );
    }

    @Transactional
    public boolean createInvoiceAndOutbox(
        BillingClaim claim,
        LocalDate cycleEnd,
        UUID invoiceId,
        UUID outboxId,
        JsonNode payload
    ) {
        int inserted = jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_invoice " +
                "(id, subscription_id, plan_id, customer_identity_id, chef_identity_id, cycle_start, cycle_end, amount, currency, status, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT_REQUESTED', now(), now()) " +
                "ON CONFLICT (subscription_id, cycle_start) DO NOTHING",
            invoiceId,
            claim.subscriptionId(),
            claim.planId(),
            claim.customerIdentityId(),
            claim.chefIdentityId(),
            claim.cycleStart(),
            cycleEnd,
            claim.amount(),
            claim.currency()
        );
        if (inserted == 1) {
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_invoice_history " +
                    "(id, invoice_id, old_status, new_status, reason, created_at) " +
                    "VALUES (?, ?, NULL, 'PAYMENT_REQUESTED', 'Billing cycle generated', now())",
                UUID.randomUUID(), invoiceId
            );
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_payment_outbox " +
                    "(id, event_key, aggregate_id, event_type, event_version, correlation_id, payload, status, created_at, updated_at) " +
                    "VALUES (?, ?, ?, 'SUBSCRIPTION_PAYMENT_REQUESTED', 'v1', ?, CAST(? AS jsonb), 'PENDING', now(), now())",
                outboxId,
                "SUBSCRIPTION_PAYMENT_REQUESTED:" + invoiceId,
                invoiceId,
                invoiceId,
                payload.toString()
            );
        }
        releaseAndAdvance(claim, cycleEnd);
        return inserted == 1;
    }

    public void releaseAndAdvance(BillingClaim claim, LocalDate nextBillingDate) {
        int updated = jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET next_billing_date = ?, billing_lock_token = NULL, billing_locked_at = NULL, updated_at = now() " +
                "WHERE id = ? AND billing_lock_token = ?",
            nextBillingDate, claim.subscriptionId(), claim.lockToken()
        );
        if (updated != 1) {
            throw new IllegalStateException("Subscription billing claim was lost");
        }
    }

    /**
     * On resume, inside the caller's transaction: voids unpaid cycles that started before the resume, carries the
     * paid days lost to the pause forward as a zero-amount PAID invoice, and moves next_billing_date past both.
     * Surviving invoices end at or before the credit start and voided ones start before the resume, so neither the
     * credit nor later billing cycles can collide on (subscription_id, cycle_start).
     */
    public PauseCredit applyPauseCredit(UUID subscriptionId, LocalDate resumeOn) {
        LocalDate pausedOn = jdbcTemplate.query(
            "SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date FROM subscription_schema.subscription_status_history " +
                "WHERE subscription_id = ? AND new_status = 'PAUSED' ORDER BY created_at DESC LIMIT 1",
            (rs, rowNum) -> rs.getObject(1, LocalDate.class), subscriptionId
        ).stream().findFirst().orElse(resumeOn);

        List<InvoiceState> unpaid = jdbcTemplate.query(
            "SELECT id, status FROM subscription_schema.subscription_invoice WHERE subscription_id = ? AND status <> 'PAID' " +
                "AND cycle_start < ? AND failure_code IS DISTINCT FROM ? FOR UPDATE",
            (rs, rowNum) -> new InvoiceState(rs.getObject("id", UUID.class), rs.getString("status")),
            subscriptionId, resumeOn, PAUSE_VOIDED
        );
        for (InvoiceState invoice : unpaid) {
            jdbcTemplate.update(
                "UPDATE subscription_schema.subscription_invoice SET status = 'CANCELLED', failure_code = ?, " +
                    "failure_message = 'Unpaid billing cycle started during a pause', updated_at = now() WHERE id = ?",
                PAUSE_VOIDED, invoice.id()
            );
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_invoice_history " +
                    "(id, invoice_id, old_status, new_status, reason, created_at) " +
                    "VALUES (?, ?, ?, 'CANCELLED', 'Unpaid billing cycle started during a pause', now())",
                UUID.randomUUID(), invoice.id(), invoice.status()
            );
        }

        LocalDate paidThrough = jdbcTemplate.queryForObject(
            "SELECT max(cycle_end) FROM subscription_schema.subscription_invoice WHERE subscription_id = ? AND status = 'PAID'",
            LocalDate.class, subscriptionId
        );
        // A plan never billed keeps its own next_billing_date, so a future start date is not billed early.
        LocalDate keptThrough = jdbcTemplate.queryForObject(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM subscription_schema.subscription_invoice i WHERE i.subscription_id = cs.id) " +
                "THEN (SELECT max(i.cycle_end) FROM subscription_schema.subscription_invoice i " +
                "WHERE i.subscription_id = cs.id AND i.failure_code IS DISTINCT FROM ?) " +
                "ELSE cs.next_billing_date END FROM subscription_schema.customer_subscription cs WHERE cs.id = ?",
            LocalDate.class, PAUSE_VOIDED, subscriptionId
        );
        PauseCredit credit = PauseCredit.plan(pausedOn, resumeOn, paidThrough, keptThrough);

        if (credit.creditDays() > 0) {
            UUID invoiceId = UUID.randomUUID();
            int inserted = jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_invoice " +
                    "(id, subscription_id, plan_id, customer_identity_id, chef_identity_id, cycle_start, cycle_end, amount, currency, " +
                    "status, provider_reference, paid_at, created_at, updated_at) " +
                    "SELECT ?, cs.id, cs.plan_id, cs.customer_identity_id, cs.chef_identity_id, ?, ?, 0, sp.currency, " +
                    "'PAID', 'PAUSE_CREDIT', now(), now(), now() " +
                    "FROM subscription_schema.customer_subscription cs " +
                    "JOIN subscription_schema.subscription_plan sp ON sp.id = cs.plan_id WHERE cs.id = ?",
                invoiceId, credit.creditStart(), credit.creditStart().plusDays(credit.creditDays()), subscriptionId
            );
            if (inserted != 1) {
                throw new IllegalStateException("Pause credit could not be recorded");
            }
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_invoice_history " +
                    "(id, invoice_id, old_status, new_status, reason, created_at) VALUES (?, ?, NULL, 'PAID', ?, now())",
                UUID.randomUUID(), invoiceId, "Pause credit: " + credit.creditDays() + " paid days carried forward"
            );
        }
        jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET next_billing_date = ?, updated_at = now() WHERE id = ?",
            credit.nextBillingDate(), subscriptionId
        );
        return credit;
    }

    public void releaseAfterFailure(BillingClaim claim) {
        jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET billing_lock_token = NULL, billing_locked_at = NULL " +
                "WHERE id = ? AND billing_lock_token = ?",
            claim.subscriptionId(), claim.lockToken()
        );
    }

    @Transactional
    public List<OutboxRecord> claimOutbox(int batchSize, int maxAttempts, int staleLockMinutes) {
        UUID lockToken = UUID.randomUUID();
        String sql = """
            WITH candidates AS (
                SELECT id
                  FROM subscription_schema.subscription_payment_outbox
                 WHERE (
                    status IN ('PENDING', 'FAILED') AND next_attempt_at <= now() AND attempt_count < ?
                 ) OR (
                    status = 'PROCESSING' AND locked_at < now() - (? * INTERVAL '1 minute')
                 )
                 ORDER BY created_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT ?
            )
            UPDATE subscription_schema.subscription_payment_outbox o
               SET status = 'PROCESSING', lock_token = ?, locked_at = now(),
                   attempt_count = attempt_count + 1, updated_at = now(), last_error = NULL
              FROM candidates c
             WHERE o.id = c.id
            RETURNING o.id, o.event_type, o.correlation_id, o.payload, o.attempt_count
            """;
        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> new OutboxRecord(
                rs.getObject("id", UUID.class),
                rs.getString("event_type"),
                rs.getObject("correlation_id", UUID.class),
                rs.getString("payload"),
                rs.getInt("attempt_count"),
                lockToken
            ),
            maxAttempts, staleLockMinutes, batchSize, lockToken
        );
    }

    public void markPublished(OutboxRecord record, String brokerMessageId) {
        jdbcTemplate.update(
            "UPDATE subscription_schema.subscription_payment_outbox SET status = 'PUBLISHED', published_at = now(), broker_message_id = ?, " +
                "lock_token = NULL, locked_at = NULL, updated_at = now() WHERE id = ? AND lock_token = ?",
            brokerMessageId, record.id(), record.lockToken()
        );
    }

    public void markPublishFailure(OutboxRecord record, int maxAttempts, String error) {
        boolean dead = record.attemptCount() >= maxAttempts;
        long delaySeconds = Math.min(3600L, 5L * (1L << Math.min(10, Math.max(0, record.attemptCount() - 1))));
        jdbcTemplate.update(
            "UPDATE subscription_schema.subscription_payment_outbox SET status = ?, next_attempt_at = now() + (? * INTERVAL '1 second'), " +
                "last_error = ?, lock_token = NULL, locked_at = NULL, updated_at = now() WHERE id = ? AND lock_token = ?",
            dead ? "DEAD_LETTER" : "FAILED",
            dead ? 0L : delaySeconds,
            safe(error),
            record.id(), record.lockToken()
        );
    }

    private static String safe(String value) {
        String normalized = value == null ? "Unknown publish failure" : value.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 1000 ? normalized.substring(0, 1000) : normalized;
    }

    private record InvoiceState(UUID id, String status) {
    }

    public record BillingClaim(
        UUID subscriptionId,
        UUID customerIdentityId,
        UUID planId,
        UUID chefIdentityId,
        LocalDate cycleStart,
        String billingPeriod,
        BigDecimal amount,
        String currency,
        UUID lockToken
    ) {
    }

    public record OutboxRecord(
        UUID id,
        String eventType,
        UUID correlationId,
        String payload,
        int attemptCount,
        UUID lockToken
    ) {
    }
}
