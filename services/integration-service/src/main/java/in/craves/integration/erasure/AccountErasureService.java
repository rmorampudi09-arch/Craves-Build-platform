package in.craves.integration.erasure;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
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
 * <p>CUSTOMER erase replaces the name, phone, email and UPI id of the person wherever this service keeps what the payment
 * provider was sent or sent back: payment_order (request and response payload), payment_attempt and payment_event
 * (raw provider payload), webhook_inbox and cashfree_webhook_delivery (raw webhook body). It replaces the drop-off (contact
 * name and phone, address lines, landmark, note, postcode, coordinates) in the delivery records of finished deliveries
 * (command, assignment and its candidates, job, events, webhook inbox, see {@link DropoffScrubber}) and on finished fleet
 * trips, plus rider notes on those trips. Amounts, ids, statuses, owners, the kitchen, the rider and the coarse area stay.
 * None of these tables has an immutability trigger (checked on the migrated schema by the database test), so nothing is
 * skipped. Rows still being handled (a payment not finished, a webhook not processed, a delivery or trip on the road) are
 * left for a later call. Meal-plan deliveries have no payment order or checkout quote here, so they can not be tied to a
 * customer and are left.
 */
@Service
public class AccountErasureService {
    static final String ERASED_NAME = "[deleted]";
    /** Never a partly visible number: digits that can not belong to anyone. */
    static final String ERASED_PHONE = "0000000000";
    static final String ERASED_EMAIL = "deleted@craves.invalid";
    static final String ERASED_TEXT = "[deleted]";
    /** A UPI id is often the phone number, so it is replaced like one. */
    static final String ERASED_UPI_ID = "deleted@upi";
    /** The delivery-address checks elsewhere want a postal code of six digits, so the same here. */
    static final String ERASED_POSTAL_CODE = "000000";
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String PAY = "payment_schema.";
    private static final String REFUND_OPEN = "'REQUESTED', 'PROCESSING', 'RETRY', 'PENDING', 'ONHOLD'";
    // PAID, FAILED, CANCELLED (a manual reservation never sent) and REVERSED (money back, so the payable is unpaid again) are final.
    private static final String PAYOUT_FINISHED = "'PAID', 'FAILED', 'REVERSED', 'CANCELLED'";
    private static final String PAYMENT_FINISHED = "'PAID', 'FAILED', 'CANCELLED'";
    private static final String TRIP_FINISHED = "'DELIVERED', 'FAILED', 'CANCELLED'";
    private static final String JOB_FINISHED = "'DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED'";
    /** A customer's checkouts, from what they paid or were quoted; a delivery record's order_id is the checkout id. */
    private static final String CHECKOUTS = "(SELECT checkout_id FROM " + PAY + "payment_order WHERE customer_identity_id = ? "
        + "UNION SELECT checkout_id FROM " + PAY + "finance_checkout_quote WHERE customer_identity_id = ?)";
    /**
     * The keys that hold the person, at any depth: Cashfree customer_details and Craves' own notes use the customer_*
     * keys, a Razorpay payment entity uses email, contact and vpa, Cashfree puts the UPI id under payment_method.upi and
     * a wallet phone under phone. Only string values are replaced; everything else in the text, formatting included, is
     * left as it was (masked card digits stay).
     */
    private static final Map<String, String> PROVIDER_KEYS = Map.ofEntries(
        Map.entry("customer_name", ERASED_NAME), Map.entry("customer_phone", ERASED_PHONE), Map.entry("customer_email", ERASED_EMAIL),
        Map.entry("contact", ERASED_PHONE), Map.entry("email", ERASED_EMAIL), Map.entry("phone", ERASED_PHONE),
        Map.entry("upi_id", ERASED_UPI_ID), Map.entry("vpa", ERASED_UPI_ID), Map.entry("payer_vpa", ERASED_UPI_ID),
        Map.entry("payer_id", ERASED_UPI_ID), Map.entry("upi_payer_id", ERASED_UPI_ID));
    /** A rider's free-text note on a trip can carry the customer's name, number or address. */
    private static final Map<String, String> TRIP_EVENT_KEYS = Map.of(
        "note", ERASED_TEXT, "customerName", ERASED_NAME, "customerFirstName", ERASED_NAME, "customerPhone", ERASED_PHONE,
        "dropAddress", ERASED_TEXT, "address", ERASED_TEXT);
    private static final String JSON_STRING = "\"(?:[^\"\\\\]|\\\\.)*\"";
    /** A provider record belongs to the person when it names the provider order id of one of their finished payments. */
    private static final String NAMES_A_FINISHED_ORDER = "EXISTS (SELECT 1 FROM " + PAY + "payment_order po WHERE po.customer_identity_id = ? "
        + "AND po.status IN (" + PAYMENT_FINISHED + ") AND length(po.provider_order_id) >= 8 AND position(po.provider_order_id IN raw_payload) > 0)";

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public AccountErasureService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        // Decimals are kept exactly (1.10 stays 1.10) when a provider body is read and written back.
        this.json = json.copy().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(JsonGenerator.Feature.WRITE_BIGDECIMAL_AS_PLAIN).setNodeFactory(JsonNodeFactory.withExactBigDecimals(true));
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
                "WITH s AS (SELECT id, " + scrub("request_payload::text", PROVIDER_KEYS) + "::jsonb AS request, " + scrub("response_payload::text", PROVIDER_KEYS) + "::jsonb AS response "
                    + "FROM " + PAY + "payment_order WHERE customer_identity_id = ?) "
                    + "UPDATE " + PAY + "payment_order p SET request_payload = s.request, response_payload = s.response FROM s "
                    + "WHERE p.id = s.id AND (p.request_payload IS DISTINCT FROM s.request OR p.response_payload IS DISTINCT FROM s.response)",
                identityId));
            String finishedOrders = "payment_order_id IN (SELECT id FROM " + PAY + "payment_order WHERE customer_identity_id = ? AND status IN ("
                + PAYMENT_FINISHED + "))";
            counts.put("payment_attempt", scrubColumn(PAY + "payment_attempt", "raw_payload", "::jsonb", PROVIDER_KEYS, finishedOrders, identityId));
            counts.put("payment_event", scrubColumn(PAY + "payment_event", "raw_payload", "::jsonb", PROVIDER_KEYS, finishedOrders, identityId));
            counts.put("webhook_inbox", scrubColumn(PAY + "webhook_inbox", "raw_payload", "", PROVIDER_KEYS,
                "processing_status IN ('PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED') AND " + NAMES_A_FINISHED_ORDER, identityId));
            // A failed delivery is retried by the worker, so it is still being handled.
            counts.put("cashfree_webhook_delivery", scrubColumn(PAY + "cashfree_webhook_delivery", "raw_payload", "", PROVIDER_KEYS,
                "processing_status IN ('COMPLETED', 'DEAD_LETTER') AND " + NAMES_A_FINISHED_ORDER, identityId));
            // A fleet trip's order_id is the checkout id; only the customer's own columns change, never the rider's.
            counts.put("fleet_trip", jdbc.update(
                "UPDATE fleet_schema.trip tr SET customer_first_name = ?, customer_phone = ?, drop_address = ?, "
                    + "drop_landmark = CASE WHEN drop_landmark IS NULL THEN NULL ELSE ? END, drop_lat = 0, drop_lng = 0 "
                    + "WHERE tr.state IN (" + TRIP_FINISHED + ") AND tr.order_id IN " + CHECKOUTS + " AND " + finished("tr.chef_sub_order_id")
                    + " AND (customer_first_name IS DISTINCT FROM ? "
                    + "OR customer_phone IS DISTINCT FROM ? OR drop_address IS DISTINCT FROM ? OR (drop_landmark IS NOT NULL AND drop_landmark <> ?) "
                    + "OR drop_lat <> 0 OR drop_lng <> 0)",
                ERASED_NAME, ERASED_PHONE, ERASED_TEXT, ERASED_TEXT, identityId, identityId, ERASED_NAME, ERASED_PHONE, ERASED_TEXT, ERASED_TEXT));
            counts.put("fleet_trip_event", scrubColumn("fleet_schema.trip_event", "detail", "::jsonb", TRIP_EVENT_KEYS,
                "trip_id IN (SELECT st.id FROM fleet_schema.trip st WHERE st.state IN (" + TRIP_FINISHED + ") AND st.order_id IN " + CHECKOUTS
                    + " AND " + finished("st.chef_sub_order_id") + ")",
                identityId, identityId));
            // Delivery records: only for an order whose delivery is over (see finished()).
            counts.put("delivery_command", scrubDropoff("delivery_command", "payload", over("t"), identityId, identityId));
            counts.put("delivery_assignment", scrubDropoff("delivery_assignment", "request_context", over("t"), identityId, identityId));
            counts.put("delivery_assignment_candidate", scrubDropoff("delivery_assignment_candidate", "provider_metadata",
                "t.assignment_id IN (SELECT a.id FROM delivery_schema.delivery_assignment a WHERE " + over("a") + ")", identityId, identityId));
            String finishedJobs = "SELECT jb.id FROM delivery_schema.delivery_job jb WHERE jb.status IN (" + JOB_FINISHED + ") AND " + over("jb");
            counts.put("delivery_job", scrubDropoff("delivery_job", "quote_snapshot", "t.id IN (" + finishedJobs + ")", identityId, identityId));
            counts.put("delivery_event", scrubDropoff("delivery_event", "payload", "t.delivery_job_id IN (" + finishedJobs + ")", identityId, identityId));
            // A webhook not yet processed (RECEIVED, PROCESSING) or retried (FAILED) is still being handled. A job keeps the provider's
            // ORDER id (Borzo's order id), so it is matched with the row's provider_order_id, never with the row's own delivery id.
            counts.put("delivery_webhook_inbox", scrubDropoff("delivery_webhook_inbox", "raw_payload",
                "t.processing_status IN ('PROCESSED', 'DUPLICATE', 'REJECTED', 'DEAD_LETTER') AND EXISTS (SELECT 1 FROM delivery_schema.delivery_job j "
                    + "WHERE j.status IN (" + JOB_FINISHED + ") AND j.order_id IN " + CHECKOUTS + " AND " + finished("j.chef_sub_order_id")
                    + " AND (j.id = t.delivery_job_id OR (j.provider_id = t.provider_id AND j.provider_delivery_id = t.provider_order_id)))",
                identityId, identityId));
        }
        LOGGER.info("account erasure service=integration requestId={} scope={} counts={}", requestId, scope, counts);
        return ErasureResponse.done(counts);
    }

    /** Only rows that would change are updated, so a second run counts zero. {@code rows} binds the identity as many times as it has ?. */
    private int scrubColumn(String table, String column, String cast, Map<String, String> keys, String rows, Object... args) {
        return jdbc.update(
            "WITH s AS (SELECT id, " + scrub(column + "::text", keys) + cast + " AS v FROM " + table + " WHERE " + rows + ") "
                + "UPDATE " + table + " t SET " + column + " = s.v FROM s WHERE t.id = s.id AND t." + column + " IS DISTINCT FROM s.v",
            args);
    }

    /** SQL that returns {@code text} with the string value of each of the keys replaced; the values are fixed constants. */
    private static String scrub(String text, Map<String, String> keys) {
        String sql = text;
        for (Map.Entry<String, String> key : keys.entrySet()) {
            sql = "regexp_replace(" + sql + ", '(\"" + key.getKey() + "\"\\s*:\\s*)" + JSON_STRING + "', '\\1\"" + key.getValue() + "\"', 'g')";
        }
        return sql;
    }

    /** The customer's rows of a delivery table, once the delivery is over. */
    private static String over(String alias) {
        return alias + ".order_id IN " + CHECKOUTS + " AND " + finished(alias + ".chef_sub_order_id");
    }

    /**
     * A delivery is over when no job, no current fleet trip and no open fleet stage of the chef order is still going and at
     * least one job or trip ended (or its command was given up). A rider who hands an order back leaves a CANCELLED trip and
     * opens a Borzo or Pidge stage, so an open stage means the order is still being booked. The stored command is what a
     * Borzo to Pidge handoff books from, so it stays until then too.
     */
    private static String finished(String chefSubOrder) {
        return "(NOT EXISTS (SELECT 1 FROM fleet_schema.trip_stage fs JOIN fleet_schema.trip fst ON fst.id = fs.trip_id WHERE fst.chef_sub_order_id = "
            + chefSubOrder + " AND fs.state = 'OPEN') AND NOT EXISTS (SELECT 1 FROM delivery_schema.delivery_job fj WHERE fj.chef_sub_order_id = " + chefSubOrder
            + " AND fj.status NOT IN (" + JOB_FINISHED + ")) AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip ft WHERE ft.chef_sub_order_id = "
            + chefSubOrder + " AND ft.replaced_at IS NULL AND ft.state NOT IN (" + TRIP_FINISHED + ")) AND (EXISTS (SELECT 1 FROM delivery_schema.delivery_job fj "
            + "WHERE fj.chef_sub_order_id = " + chefSubOrder + ") OR EXISTS (SELECT 1 FROM fleet_schema.trip ft WHERE ft.chef_sub_order_id = " + chefSubOrder
            + ") OR EXISTS (SELECT 1 FROM delivery_schema.delivery_command fc WHERE fc.chef_sub_order_id = " + chefSubOrder + " AND fc.status = 'DEAD_LETTER')))";
    }

    /** Reads the json column of each matching row, replaces the drop-off in it and writes back only what changed. */
    private int scrubDropoff(String table, String column, String where, Object... args) {
        String qualified = "delivery_schema." + table;
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT t.id, t." + column + "::text AS body FROM " + qualified + " t WHERE " + where + " ORDER BY t.id FOR UPDATE OF t", args);
        int changed = 0;
        for (Map<String, Object> row : rows) {
            try {
                JsonNode tree = json.readTree((String) row.get("body"));
                if (DropoffScrubber.scrub(tree)) {
                    jdbc.update("UPDATE " + qualified + " SET " + column + " = ?::jsonb WHERE id = ?", json.writeValueAsString(tree), row.get("id"));
                    changed++;
                }
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("A stored delivery record is not valid JSON: " + qualified + " " + row.get("id"), e);
            }
        }
        return changed;
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
