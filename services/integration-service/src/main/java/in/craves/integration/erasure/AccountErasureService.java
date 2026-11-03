package in.craves.integration.erasure;

import in.craves.integration.erasure.AccountErasureDtos.Blocker;
import in.craves.integration.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.integration.erasure.AccountErasureDtos.Scope;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account deletion. The ledger, payables, payout instructions and the encrypted bank details are legal records behind
 * immutability triggers and are never touched. CHEF erase therefore does nothing; only its blockers matter: staff
 * approve a chef deletion once nothing is payable, unfinished or owed behind a hold.
 *
 * <p>CUSTOMER erase replaces the name, phone and email of the person wherever this service keeps what the payment
 * provider was sent or sent back: payment_order (request and response payload), payment_attempt and payment_event
 * (raw provider payload), webhook_inbox and cashfree_webhook_delivery (raw webhook body), and the customer name and phone
 * on finished fleet trips. Amounts, ids, statuses and owners stay. None of these tables has an immutability trigger
 * (checked on the migrated schema by the database test), so nothing is skipped. Rows still being handled (a payment
 * not finished, a webhook not processed, a trip on the road) are left for a later call.
 */
@Service
public class AccountErasureService {
    static final String ERASED_NAME = "[deleted]";
    /** Never a partly visible number: digits that can not belong to anyone. */
    static final String ERASED_PHONE = "0000000000";
    static final String ERASED_EMAIL = "deleted@craves.invalid";
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String PAY = "payment_schema.";
    private static final String REFUND_OPEN = "'REQUESTED', 'PROCESSING', 'RETRY', 'PENDING', 'ONHOLD'";
    // PAID, FAILED, CANCELLED (a manual reservation never sent) and REVERSED (money back, so the payable is unpaid again) are final.
    private static final String PAYOUT_FINISHED = "'PAID', 'FAILED', 'REVERSED', 'CANCELLED'";
    private static final String PAYMENT_FINISHED = "'PAID', 'FAILED', 'CANCELLED'";
    private static final String TRIP_FINISHED = "'DELIVERED', 'FAILED', 'CANCELLED'";
    /**
     * The keys that hold the person, at any depth: Cashfree customer_details and Craves' own notes use the customer_*
     * keys, a Razorpay payment entity uses email and contact. Only string values are replaced; everything else in the
     * text, formatting included, is left as it was.
     */
    private static final Map<String, String> ERASED_KEYS = Map.of(
        "customer_name", ERASED_NAME, "customer_phone", ERASED_PHONE, "customer_email", ERASED_EMAIL,
        "contact", ERASED_PHONE, "email", ERASED_EMAIL);
    private static final String JSON_STRING = "\"(?:[^\"\\\\]|\\\\.)*\"";
    /** A provider record belongs to the person when it names the provider order id of one of their finished payments. */
    private static final String NAMES_A_FINISHED_ORDER = "EXISTS (SELECT 1 FROM " + PAY + "payment_order po WHERE po.customer_identity_id = ? "
        + "AND po.status IN (" + PAYMENT_FINISHED + ") AND length(po.provider_order_id) >= 8 AND position(po.provider_order_id IN raw_payload) > 0)";

    private final JdbcTemplate jdbc;

    public AccountErasureService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Blocker> blockers(UUID identityId, Scope scope) {
        List<Blocker> found = new ArrayList<>();
        if (scope != Scope.CHEF) {
            add(found, "REFUND_IN_FLIGHT", "%d refund(s) are still being paid back to the customer", count(
                "SELECT count(*) FROM " + PAY + "refund r WHERE r.status IN (" + REFUND_OPEN + ") AND (r.customer_identity_id = ? "
                    + "OR r.payment_order_id IN (SELECT id FROM " + PAY + "payment_order WHERE customer_identity_id = ?))",
                identityId, identityId));
        }
        if (scope != Scope.CUSTOMER) {
            int unpaid = count(
                "SELECT count(*) FROM " + PAY + "finance_payable p WHERE p.chef_identity_id = ? AND NOT EXISTS ("
                    + "SELECT 1 FROM " + PAY + "finance_payout_allocation a JOIN " + PAY + "finance_payout_instruction i ON i.id = a.instruction_id "
                    + "WHERE a.payable_id = p.id AND a.active AND i.status = 'PAID')", identityId);
            int unsettled = count(
                "SELECT count(*) FROM " + PAY + "chef_earning_entry WHERE chef_identity_id = ? AND status = 'SETTLEMENT_PENDING'", identityId);
            add(found, "PAYABLE_UNPAID", "%d chef earning(s) are not paid out yet", unpaid);
            add(found, "PAYOUT_NOT_FINISHED", "%d payout(s) have not finished", count(
                "SELECT count(*) FROM " + PAY + "finance_payout_instruction WHERE chef_identity_id = ? AND status NOT IN (" + PAYOUT_FINISHED + ")",
                identityId));
            // The default hold of a chef with no verified bank account, or one staff placed, matters only while money is owed behind it.
            add(found, "PAYOUT_ON_HOLD", "Payouts are on hold for this chef while money is still owed", unpaid + unsettled == 0 ? 0 : count(
                "SELECT count(*) FROM " + PAY + "finance_chef_payout_control WHERE chef_identity_id = ? AND on_hold", identityId));
            add(found, "SETTLEMENT_PENDING", "%d earning(s) are waiting for settlement", unsettled);
            add(found, "REFERRAL_EARNING_UNPAID", "%d referral earning(s) are not paid out yet", count(
                "SELECT count(*) FROM " + PAY + "finance_referral_available WHERE chef_identity_id = ? AND amount > 0", identityId));
        }
        return found;
    }

    /** One transaction, blockers read first: either everything below happens or nothing does. */
    @Transactional
    public ErasureResponse erase(UUID identityId, Scope scope, UUID requestId) {
        List<Blocker> blockers = blockers(identityId, scope);
        if (!blockers.isEmpty()) {
            return ErasureResponse.blocked(blockers);
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (scope != Scope.CHEF) {
            counts.put("payment_order", jdbc.update(
                "WITH s AS (SELECT id, " + scrub("request_payload::text") + "::jsonb AS request, " + scrub("response_payload::text") + "::jsonb AS response "
                    + "FROM " + PAY + "payment_order WHERE customer_identity_id = ?) "
                    + "UPDATE " + PAY + "payment_order p SET request_payload = s.request, response_payload = s.response FROM s "
                    + "WHERE p.id = s.id AND (p.request_payload IS DISTINCT FROM s.request OR p.response_payload IS DISTINCT FROM s.response)",
                identityId));
            String finishedOrders = "payment_order_id IN (SELECT id FROM " + PAY + "payment_order WHERE customer_identity_id = ? AND status IN ("
                + PAYMENT_FINISHED + "))";
            counts.put("payment_attempt", scrubColumn("payment_attempt", "raw_payload", "::jsonb", finishedOrders, identityId));
            counts.put("payment_event", scrubColumn("payment_event", "raw_payload", "::jsonb", finishedOrders, identityId));
            counts.put("webhook_inbox", scrubColumn("webhook_inbox", "raw_payload", "",
                "processing_status IN ('PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED') AND " + NAMES_A_FINISHED_ORDER, identityId));
            // A failed delivery is retried by the worker, so it is still being handled.
            counts.put("cashfree_webhook_delivery", scrubColumn("cashfree_webhook_delivery", "raw_payload", "",
                "processing_status IN ('COMPLETED', 'DEAD_LETTER') AND " + NAMES_A_FINISHED_ORDER, identityId));
            // A fleet trip's order_id is the checkout id; only the customer's own columns change, never the rider's.
            counts.put("fleet_trip", jdbc.update(
                "UPDATE fleet_schema.trip SET customer_first_name = ?, customer_phone = ? WHERE state IN (" + TRIP_FINISHED + ") AND order_id IN ("
                    + "SELECT checkout_id FROM " + PAY + "payment_order WHERE customer_identity_id = ? "
                    + "UNION SELECT checkout_id FROM " + PAY + "finance_checkout_quote WHERE customer_identity_id = ?) "
                    + "AND (customer_first_name IS DISTINCT FROM ? OR customer_phone IS DISTINCT FROM ?)",
                ERASED_NAME, ERASED_PHONE, identityId, identityId, ERASED_NAME, ERASED_PHONE));
        }
        LOGGER.info("account erasure service=integration requestId={} scope={} counts={}", requestId, scope, counts);
        return ErasureResponse.done(counts);
    }

    /** Only rows that would change are updated, so a second run counts zero. {@code rows} binds the identity once. */
    private int scrubColumn(String table, String column, String cast, String rows, UUID identityId) {
        return jdbc.update(
            "WITH s AS (SELECT id, " + scrub(column + "::text") + cast + " AS v FROM " + PAY + table + " WHERE " + rows + ") "
                + "UPDATE " + PAY + table + " t SET " + column + " = s.v FROM s WHERE t.id = s.id AND t." + column + " IS DISTINCT FROM s.v",
            identityId);
    }

    /** SQL that returns {@code text} with the string value of each personal key replaced; the values are fixed constants. */
    private static String scrub(String text) {
        String sql = text;
        for (Map.Entry<String, String> key : ERASED_KEYS.entrySet()) {
            sql = "regexp_replace(" + sql + ", '(\"" + key.getKey() + "\"\\s*:\\s*)" + JSON_STRING + "', '\\1\"" + key.getValue() + "\"', 'g')";
        }
        return sql;
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    private static void add(List<Blocker> found, String code, String detail, int count) {
        if (count > 0) {
            found.add(new Blocker(code, detail.contains("%d") ? detail.formatted(count) : detail));
        }
    }
}
