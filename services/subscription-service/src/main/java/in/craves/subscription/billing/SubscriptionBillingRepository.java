package in.craves.subscription.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class SubscriptionBillingRepository {
    /** failure_code of an unpaid invoice whose cycle started during a pause; read by the payment-status consumer. */
    public static final String PAUSE_VOIDED = "PAUSED_CYCLE_VOIDED";
    /** failure_code of a voided invoice that was paid anyway; the money waits for a manual refund. */
    public static final String PAID_AFTER_VOID = "PAYMENT_RECEIVED_FOR_VOIDED_CYCLE";
    /** Outbox event telling integration-service a bill was voided, so its payment intent stops being payable. */
    public static final String INVOICE_VOIDED = "SUBSCRIPTION_INVOICE_VOIDED";
    /** Invoices a resume has not voided (voided ones, paid or not, no longer cover or block anything). */
    private static final String STANDING =
        "(failure_code IS NULL OR failure_code NOT IN ('" + PAUSE_VOIDED + "', '" + PAID_AFTER_VOID + "'))";
    /** provider_reference of the zero-amount PAID invoices that carry days forward. */
    private static final String CREDITS = "('PAUSE_CREDIT', 'DECLINE_CREDIT')";

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
     * On resume, inside the caller's transaction: voids unpaid cycles that started before the resume, carries the paid
     * days the pause actually stopped forward as a zero-amount PAID invoice (laying out again an earlier credit that had
     * not started yet, so no unpaid gap is left before it), and moves next_billing_date past it.
     * Standing invoices end at or before the credit start and voided ones start before the resume, so neither the credit
     * nor later billing cycles can collide on (subscription_id, cycle_start).
     */
    public PauseCredit applyPauseCredit(UUID subscriptionId, LocalDate resumeOn) {
        LocalDate pauseDate = jdbcTemplate.query(
            "SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date FROM subscription_schema.subscription_status_history " +
                "WHERE subscription_id = ? AND new_status = 'PAUSED' ORDER BY created_at DESC LIMIT 1",
            (rs, rowNum) -> rs.getObject(1, LocalDate.class), subscriptionId
        ).stream().findFirst().orElse(resumeOn);
        // Meals already sent to the chef when the customer paused were still delivered, or added to the end if the chef
        // declined them (FAILED), so they are not credited again.
        LocalDate lastMealSent = jdbcTemplate.queryForObject(
            "SELECT max(service_date) FROM subscription_schema.subscription_occurrence WHERE subscription_id = ? " +
                "AND status IN ('ORDER_REQUESTED', 'ORDER_CREATED', 'FAILED') AND service_date >= ? AND service_date < ?",
            LocalDate.class, subscriptionId, pauseDate, resumeOn
        );
        LocalDate pausedOn = lastMealSent == null ? pauseDate : lastMealSent.plusDays(1);

        List<InvoiceState> unpaid = jdbcTemplate.query(
            "SELECT id, status FROM subscription_schema.subscription_invoice WHERE subscription_id = ? AND status <> 'PAID' " +
                "AND cycle_start < ? AND " + STANDING + " FOR UPDATE",
            (rs, rowNum) -> new InvoiceState(rs.getObject("id", UUID.class), rs.getString("status")),
            subscriptionId, resumeOn
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
            // Tells integration-service, so the voided bill's payment intent can no longer be paid.
            UUID outboxId = UUID.randomUUID();
            ObjectNode data = JsonNodeFactory.instance.objectNode()
                .put("invoiceId", invoice.id().toString())
                .put("subscriptionId", subscriptionId.toString())
                .put("reason", PAUSE_VOIDED);
            ObjectNode event = JsonNodeFactory.instance.objectNode()
                .put("eventId", outboxId.toString())
                .put("eventType", INVOICE_VOIDED)
                .put("eventVersion", "v1")
                .put("occurredAt", Instant.now().toString())
                .put("correlationId", invoice.id().toString())
                .put("causationId", subscriptionId.toString())
                .put("subject", invoice.id().toString());
            event.set("data", data);
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_payment_outbox " +
                    "(id, event_key, aggregate_id, event_type, event_version, correlation_id, payload, status, created_at, updated_at) " +
                    "VALUES (?, ?, ?, ?, 'v1', ?, CAST(? AS jsonb), 'PENDING', now(), now())",
                outboxId, INVOICE_VOIDED + ":" + invoice.id(), invoice.id(), INVOICE_VOIDED, invoice.id(), event.toString()
            );
        }

        // Credits that have not started and come after every billed invoice (earlier pause credits, or days added after a
        // chef decline) move into the new credit, so none is left behind a bill this resume just voided.
        List<CreditRow> unstarted = jdbcTemplate.query(
            "SELECT f.id, f.cycle_start, f.cycle_end FROM subscription_schema.subscription_invoice f " +
                "WHERE f.subscription_id = ? AND f.status = 'PAID' AND f.provider_reference IN " + CREDITS + " AND f.cycle_start >= ? " +
                "AND NOT EXISTS (SELECT 1 FROM subscription_schema.subscription_invoice later " +
                "WHERE later.subscription_id = f.subscription_id AND later.cycle_start > f.cycle_start AND " + STANDING + " " +
                "AND later.provider_reference IS DISTINCT FROM 'PAUSE_CREDIT' AND later.provider_reference IS DISTINCT FROM 'DECLINE_CREDIT') " +
                "ORDER BY f.cycle_start FOR UPDATE",
            (rs, rowNum) -> new CreditRow(
                rs.getObject("id", UUID.class), rs.getObject("cycle_start", LocalDate.class), rs.getObject("cycle_end", LocalDate.class)
            ),
            subscriptionId, resumeOn
        );
        int carriedDays = unstarted.stream().mapToInt(row -> Math.toIntExact(ChronoUnit.DAYS.between(row.start(), row.end()))).sum();
        LocalDate unstartedFrom = unstarted.isEmpty() ? null : unstarted.getFirst().start();

        List<PauseCredit.Cycle> paidCycles = jdbcTemplate.query(
            "SELECT cycle_start, cycle_end FROM subscription_schema.subscription_invoice " +
                "WHERE subscription_id = ? AND status = 'PAID' AND cycle_end > ? AND cycle_start < ?",
            (rs, rowNum) -> new PauseCredit.Cycle(rs.getObject("cycle_start", LocalDate.class), rs.getObject("cycle_end", LocalDate.class)),
            subscriptionId, pausedOn, resumeOn
        );
        // A plan never billed keeps its own next_billing_date, so a future start date is not billed early.
        LocalDate keptThrough = jdbcTemplate.queryForObject(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM subscription_schema.subscription_invoice i WHERE i.subscription_id = cs.id) " +
                "THEN (SELECT max(i.cycle_end) FROM subscription_schema.subscription_invoice i " +
                "WHERE i.subscription_id = cs.id AND (CAST(? AS date) IS NULL OR i.cycle_start < CAST(? AS date)) AND " + STANDING + ") " +
                "ELSE cs.next_billing_date END FROM subscription_schema.customer_subscription cs WHERE cs.id = ?",
            LocalDate.class, unstartedFrom, unstartedFrom, subscriptionId
        );
        PauseCredit credit = PauseCredit.plan(pausedOn, resumeOn, paidCycles, carriedDays, keptThrough);

        if (!unstarted.isEmpty()) {
            // Park the rows far ahead first: laying them out one by one could briefly reuse another row's cycle_start.
            for (CreditRow row : unstarted) {
                jdbcTemplate.update(
                    "UPDATE subscription_schema.subscription_invoice SET cycle_start = cycle_start + 36500, cycle_end = cycle_end + 36500 WHERE id = ?",
                    row.id()
                );
            }
            // Back to back from the credit start; the first one also takes the days this pause stopped.
            // shortcut: a moved decline credit keeps its calendar length, so moving one that spanned a no-meal weekend
            // onto weekdays credits up to 2 extra days; recompute it from the plan schedule if that shows up.
            LocalDate cursor = credit.creditStart();
            int pausedDays = credit.creditDays() - carriedDays;
            for (CreditRow row : unstarted) {
                LocalDate end = cursor.plusDays(ChronoUnit.DAYS.between(row.start(), row.end()) + (row == unstarted.getFirst() ? pausedDays : 0));
                jdbcTemplate.update(
                    "UPDATE subscription_schema.subscription_invoice SET cycle_start = ?, cycle_end = ?, updated_at = now() WHERE id = ?",
                    cursor, end, row.id()
                );
                creditHistory(row.id(), "PAID", "Credit laid out again after a later pause: " + ChronoUnit.DAYS.between(cursor, end) + " days");
                cursor = end;
            }
        } else if (credit.creditDays() > 0) {
            UUID invoiceId = UUID.randomUUID();
            int inserted = jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_invoice " +
                    "(id, subscription_id, plan_id, customer_identity_id, chef_identity_id, cycle_start, cycle_end, amount, currency, " +
                    "status, provider_reference, paid_at, created_at, updated_at) " +
                    "SELECT ?, cs.id, cs.plan_id, cs.customer_identity_id, cs.chef_identity_id, ?, ?, 0, sp.currency, " +
                    "'PAID', 'PAUSE_CREDIT', now(), now(), now() " +
                    "FROM subscription_schema.customer_subscription cs " +
                    "JOIN subscription_schema.subscription_plan sp ON sp.id = cs.plan_id WHERE cs.id = ?",
                invoiceId, credit.creditStart(), credit.nextBillingDate(), subscriptionId
            );
            if (inserted != 1) {
                throw new IllegalStateException("Pause credit could not be recorded");
            }
            creditHistory(invoiceId, null, "Pause credit: " + credit.creditDays() + " paid days carried forward");
        }
        jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET next_billing_date = ?, updated_at = now() WHERE id = ?",
            credit.nextBillingDate(), subscriptionId
        );
        return credit;
    }

    /**
     * Inside the caller's transaction: a meal the chef declined is added to the end of the plan as a zero-amount PAID
     * invoice running from where billing would restart through the next date that serves that meal (or one day if none
     * does within 62 days). next_billing_date moves past it. Returns the new next_billing_date, or null when the plan is
     * not ACTIVE or PAUSED, or was never paid. The credit starts at or after every standing invoice's end and after every
     * voided cycle's start, so it cannot collide on (subscription_id, cycle_start).
     */
    public LocalDate applyDeclineCredit(UUID subscriptionId, Predicate<LocalDate> servesMeal) {
        List<LocalDate> starts = jdbcTemplate.query(
            "SELECT GREATEST(cs.next_billing_date, (SELECT max(i.cycle_end) FROM subscription_schema.subscription_invoice i " +
                "WHERE i.subscription_id = cs.id AND " + STANDING + ")) FROM subscription_schema.customer_subscription cs " +
                "WHERE cs.id = ? AND cs.status IN ('ACTIVE', 'PAUSED') AND EXISTS (SELECT 1 FROM subscription_schema.subscription_invoice p " +
                "WHERE p.subscription_id = cs.id AND p.status = 'PAID') FOR UPDATE OF cs",
            (rs, rowNum) -> rs.getObject(1, LocalDate.class), subscriptionId
        );
        if (starts.isEmpty() || starts.getFirst() == null) {
            return null;
        }
        LocalDate start = starts.getFirst();
        int days = 1;
        for (int offset = 0; offset < 62; offset++) {
            if (servesMeal.test(start.plusDays(offset))) {
                days = offset + 1;
                break;
            }
        }
        LocalDate end = start.plusDays(days);
        UUID invoiceId = UUID.randomUUID();
        int inserted = jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_invoice " +
                "(id, subscription_id, plan_id, customer_identity_id, chef_identity_id, cycle_start, cycle_end, amount, currency, " +
                "status, provider_reference, paid_at, created_at, updated_at) " +
                "SELECT ?, cs.id, cs.plan_id, cs.customer_identity_id, cs.chef_identity_id, ?, ?, 0, sp.currency, " +
                "'PAID', 'DECLINE_CREDIT', now(), now(), now() " +
                "FROM subscription_schema.customer_subscription cs " +
                "JOIN subscription_schema.subscription_plan sp ON sp.id = cs.plan_id WHERE cs.id = ?",
            invoiceId, start, end, subscriptionId
        );
        if (inserted != 1) {
            throw new IllegalStateException("Decline credit could not be recorded");
        }
        creditHistory(invoiceId, null, "Chef declined a meal: " + days + " days added to the end of the plan");
        jdbcTemplate.update(
            "UPDATE subscription_schema.customer_subscription SET next_billing_date = ?, updated_at = now() WHERE id = ?",
            end, subscriptionId
        );
        // Meals already generated for the added days were waiting for a bill; the credit pays for them.
        List<UUID> waiting = jdbcTemplate.query(
            "UPDATE subscription_schema.subscription_occurrence SET status = 'READY_FOR_ORDER', updated_at = now() " +
                "WHERE subscription_id = ? AND service_date >= ? AND service_date < ? AND status = 'BILLING_PENDING' RETURNING id",
            (rs, rowNum) -> rs.getObject("id", UUID.class), subscriptionId, start, end
        );
        for (UUID occurrenceId : waiting) {
            jdbcTemplate.update(
                "INSERT INTO subscription_schema.subscription_occurrence_history " +
                    "(id, occurrence_id, old_status, new_status, reason, source, created_at) " +
                    "VALUES (?, ?, 'BILLING_PENDING', 'READY_FOR_ORDER', 'Day added after a chef decline', 'CHEF_DECLINED', now())",
                UUID.randomUUID(), occurrenceId
            );
        }
        return end;
    }

    private void creditHistory(UUID invoiceId, String oldStatus, String reason) {
        jdbcTemplate.update(
            "INSERT INTO subscription_schema.subscription_invoice_history " +
                "(id, invoice_id, old_status, new_status, reason, created_at) VALUES (?, ?, ?, 'PAID', ?, now())",
            UUID.randomUUID(), invoiceId, oldStatus, reason
        );
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

    private record CreditRow(UUID id, LocalDate start, LocalDate end) {
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
