package in.craves.order.erasure;

import in.craves.order.erasure.AccountErasureDtos.Blocker;
import in.craves.order.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.order.erasure.AccountErasureDtos.Scope;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
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
 * Account deletion. An order that is still being paid for, cooked, delivered or refunded stops it. Otherwise CUSTOMER erase
 * deletes the cart, reviews, delivery codes and replay records, and replaces the delivery address, phone and note of every
 * order and checkout with placeholders. The order rows stay with their ids, amounts and owner: once an order is bound to a
 * financial snapshot the database refuses any change to them. Copies of the address in the message tables go too, but only
 * once the message is finished (sent, published or processed): one still waiting to go out is left for the sender. A chef
 * has nothing to remove here, only orders that may block. Every step is safe to repeat.
 */
@Service
public class AccountErasureService {
    /** Replaces names, address lines, area, city and state. */
    public static final String ERASED_TEXT = "[deleted]";
    /** The delivery-address check wants a phone and a postal code on every order that has an address id, so they get these. */
    public static final String ERASED_PHONE = "0000000000";
    public static final String ERASED_POSTAL_CODE = "000000";
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String SCHEMA = "order_schema.";
    private static final String IN_PROGRESS =
        "'PAYMENT_PENDING', 'PAID', 'CHEF_ACCEPTANCE_PENDING', 'CHEF_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'";
    private static final String REFUND_OPEN = "'REFUND_PENDING', 'REFUND_FAILED'";
    // Line 2 and landmark are optional, so they are cleared; coordinates 0, 0 pass the check that they lie on the globe.
    private static final String DROPOFF_SET = "dropoff_recipient_name = ?, dropoff_contact_phone = ?, dropoff_address_line1 = ?, "
        + "dropoff_address_line2 = NULL, dropoff_landmark = NULL, dropoff_area_name = ?, dropoff_city = ?, dropoff_state = ?, "
        + "dropoff_postal_code = ?, dropoff_latitude = 0, dropoff_longitude = 0";
    private static final String DROPOFF_NOW = "dropoff_recipient_name, dropoff_contact_phone, dropoff_address_line1, dropoff_address_line2, "
        + "dropoff_landmark, dropoff_area_name, dropoff_city, dropoff_state, dropoff_postal_code, dropoff_latitude, dropoff_longitude";
    private static final String DROPOFF_ERASED = "?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0, 0";
    private static final List<String> DROPOFF_VALUES =
        List.of(ERASED_TEXT, ERASED_PHONE, ERASED_TEXT, ERASED_TEXT, ERASED_TEXT, ERASED_TEXT, ERASED_POSTAL_CODE);
    private static final String OWN_REVIEWS = "SELECT id FROM " + SCHEMA + "order_review WHERE customer_identity_id = ?";
    private static final String OWN_ORDERS = "SELECT id FROM " + SCHEMA + "customer_order WHERE customer_identity_id = ?";
    // The customer's stop in a CHEF_ACCEPTED_ORDER event; merged over the stored object, so the kitchen's stop and the rest stay.
    private static final String DROPOFF_PATH = "payload_json #> '{data,deliveryRequest,dropoff}'";
    private static final String DROPOFF_PLACEHOLDERS = ("{\"address\":\"%1$s\",\"contactName\":\"%1$s\",\"contactPhone\":\"%2$s\","
        + "\"latitude\":0,\"longitude\":0,\"addressLine1\":\"%1$s\",\"addressLine2\":null,\"landmark\":null,\"area\":\"%1$s\","
        + "\"city\":\"%1$s\",\"state\":\"%1$s\",\"postalCode\":\"%3$s\"}").formatted(ERASED_TEXT, ERASED_PHONE, ERASED_POSTAL_CODE);

    private final JdbcTemplate db;

    public AccountErasureService(JdbcTemplate db) {
        this.db = db;
    }

    public List<Blocker> blockers(UUID identityId, Scope scope) {
        List<Blocker> blockers = new ArrayList<>();
        if (scope != Scope.CHEF) {
            addIfAny(blockers, "ORDER_IN_PROGRESS", "order(s) are still being paid for, cooked or delivered",
                countOrders("customer_identity_id", IN_PROGRESS, identityId));
            addIfAny(blockers, "REFUND_IN_PROGRESS", "order(s) have a refund that has not finished",
                countOrders("customer_identity_id", REFUND_OPEN, identityId));
        }
        if (scope != Scope.CUSTOMER) {
            addIfAny(blockers, "KITCHEN_ORDER_IN_PROGRESS", "order(s) for this chef's kitchen are still being paid for, cooked or delivered",
                countOrders("chef_identity_id", IN_PROGRESS, identityId));
        }
        return blockers;
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
            counts.put("cart_item", delete("cart_item WHERE cart_id IN (SELECT id FROM " + SCHEMA + "cart WHERE customer_identity_id = ?)", identityId));
            counts.put("cart", delete("cart WHERE customer_identity_id = ?", identityId));
            // The person's own votes and reports on other reviews, and everything attached to the reviews they wrote.
            counts.put("order_review_report", delete("order_review_report WHERE reporter_identity_id = ? OR review_id IN (" + OWN_REVIEWS + ")", identityId, identityId));
            counts.put("order_review_helpful_vote", delete("order_review_helpful_vote WHERE voter_identity_id = ? OR review_id IN (" + OWN_REVIEWS + ")", identityId, identityId));
            for (String table : List.of("order_review_moderation_audit", "order_review_media", "order_review_tag", "order_review_revision")) {
                counts.put(table, delete(table + " WHERE review_id IN (" + OWN_REVIEWS + ")", identityId));
            }
            counts.put("order_review", delete("order_review WHERE customer_identity_id = ?", identityId));
            counts.put("order_delivery_code", delete("order_delivery_code WHERE order_id IN (" + OWN_ORDERS + ")", identityId));
            counts.put("idempotency_record", delete("idempotency_record WHERE actor_hash = ?", idempotencyActorHash(identityId)));
            counts.put("notification_outbox", delete("notification_outbox WHERE user_identity_id = ? AND user_role = 'CUSTOMER' AND status IN ('SENT', 'DEAD')", identityId));
            counts.put("domain_event_outbox", scrubPublishedDropoffs(identityId));
            counts.put("delivery_status_inbox", scrubFinishedTrackingLinks(identityId));
            // updated_at is left alone: the admin dashboard counts deliveries by it, and the order itself did not change.
            counts.put("customer_order", anonymiseDropoff("customer_order", true, identityId));
            counts.put("checkout", anonymiseDropoff("checkout", false, identityId));
        }
        LOGGER.info("account erasure service=order requestId={} scope={} counts={}", requestId, scope, counts);
        return ErasureResponse.done(counts);
    }

    /**
     * Only rows that still carry an address are touched, which is what makes a second call count zero; the WHERE compares
     * whole rows, so null is handled. Rows older than the address columns have none and are skipped.
     */
    private int anonymiseDropoff(String table, boolean withNote, UUID identityId) {
        List<Object> args = new ArrayList<>(DROPOFF_VALUES);
        args.add(identityId);
        args.addAll(DROPOFF_VALUES);
        return db.update(
            "UPDATE " + SCHEMA + table + " SET " + DROPOFF_SET + (withNote ? ", customer_note = NULL" : "")
                + " WHERE customer_identity_id = ? AND dropoff_address_line1 IS NOT NULL AND ("
                + DROPOFF_NOW + (withNote ? ", customer_note" : "") + ") IS DISTINCT FROM ("
                + DROPOFF_ERASED + (withNote ? ", NULL" : "") + ")",
            args.toArray());
    }

    /** Events already published (or given up on) only; PENDING, FAILED and PROCESSING ones are still to be sent with the real address. */
    private int scrubPublishedDropoffs(UUID identityId) {
        return db.update(
            "UPDATE " + SCHEMA + "domain_event_outbox SET payload_json = jsonb_set(payload_json, '{data,deliveryRequest,dropoff}', ("
                + DROPOFF_PATH + ") || CAST(? AS jsonb)) WHERE aggregate_type = 'CUSTOMER_ORDER' AND status IN ('PUBLISHED', 'DEAD') "
                + "AND aggregate_id IN (" + OWN_ORDERS + ") AND jsonb_typeof(" + DROPOFF_PATH + ") = 'object' "
                + "AND (" + DROPOFF_PATH + ") <> ((" + DROPOFF_PATH + ") || CAST(? AS jsonb))",
            DROPOFF_PLACEHOLDERS, identityId, DROPOFF_PLACEHOLDERS);
    }

    /**
     * The provider's tracking link for the person's delivery. The courier's own details and the handoff fields the delivery
     * code reads from this payload stay. Rows still waiting for an earlier event are left as they are.
     */
    private int scrubFinishedTrackingLinks(UUID identityId) {
        return db.update(
            "UPDATE " + SCHEMA + "delivery_status_inbox SET payload = jsonb_set(payload, '{data,trackingUrl}', to_jsonb(CAST(? AS text))) "
                + "WHERE processing_status IN ('PROCESSED', 'STALE', 'TERMINAL_PROTECTED', 'NO_CHANGE', 'REJECTED') "
                + "AND chef_sub_order_id IN (" + OWN_ORDERS + ") AND jsonb_typeof(payload #> '{data,trackingUrl}') = 'string' "
                + "AND payload #>> '{data,trackingUrl}' <> ?",
            ERASED_TEXT, identityId, ERASED_TEXT);
    }

    private int delete(String fromAndWhere, Object... args) {
        return db.update("DELETE FROM " + SCHEMA + fromAndWhere, args);
    }

    private int countOrders(String personColumn, String statuses, UUID identityId) {
        Integer value = db.queryForObject(
            "SELECT count(*) FROM " + SCHEMA + "customer_order WHERE " + personColumn + " = ? AND status IN (" + statuses + ")",
            Integer.class, identityId);
        return value == null ? 0 : value;
    }

    /** The key the Idempotency-Key filter files a caller's records under: SHA-256 of "caller:" and the identity id. */
    private static String idempotencyActorHash(UUID identityId) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(("caller:" + identityId).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static void addIfAny(List<Blocker> blockers, String code, String what, int found) {
        if (found > 0) {
            blockers.add(new Blocker(code, found + " " + what));
        }
    }
}
