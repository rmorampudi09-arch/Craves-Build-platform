package in.craves.order.advanced;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * M24a slice 2: a checkout may carry {@code promotion: {"code"?}}. Order-service reserves it in M08 with the customer's own token
 * inside the checkout transaction (Idempotency-Key = checkout id), keeps it only if it is Craves-funded, priced on the same food
 * subtotal and within the person's limit counted from this service's own checkouts, and records it. Finance reads the discount
 * through {@link PromotionCheckoutController}; after the paid callback a worker confirms it in M08 with the internal secret, and a
 * checkout cancelled before payment releases it. Every answer other than 200 from those calls goes to REVIEW: never a second discount.
 */
@Service
@ConditionalOnProperty(name = "CRAVES_ADVANCED_CHECKOUT_PROMOTIONS_ENABLED", havingValue = "true")
public class PromotionCheckout {
    static final int MAX_ATTEMPTS = 20;
    private static final String CODE = "[A-Za-z0-9]{4,20}";
    private final RestClient publicApi;
    private final RestClient internalApi;
    private final String secret;
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private int unpaidMinutes = 30;
    private long nextCancelledSweep = System.nanoTime();

    @Autowired
    public PromotionCheckout(RestClient.Builder builder, JdbcTemplate db, ObjectMapper json, PlatformTransactionManager manager,
                             @Value("${CRAVES_ADVANCED_BASE_URL:https://api.craves.in}") String baseUrl,
                             @Value("${CRAVES_ADVANCED_INTERNAL_BASE_URL:}") String internalBaseUrl,
                             @Value("${CRAVES_ADVANCED_INTERNAL_SECRET:}") String secret) {
        this(builder.clone().baseUrl(baseUrl).requestFactory(timeouts()).build(),
            internalBaseUrl.isBlank() ? null : builder.clone().baseUrl(internalBaseUrl).requestFactory(timeouts()).build(),
            secret, db, json, new TransactionTemplate(manager));
    }

    /** Minutes after which an unpaid checkout's reservation stops counting against the person's limit (a technical window, 5-1440). */
    @Autowired
    void unpaidMinutes(@Value("${CRAVES_ADVANCED_CHECKOUT_PROMOTION_UNPAID_MINUTES:30}") int minutes) {
        this.unpaidMinutes = Math.max(5, Math.min(1440, minutes));
    }

    PromotionCheckout(RestClient publicApi, RestClient internalApi, String secret, JdbcTemplate db, ObjectMapper json, TransactionTemplate tx) {
        this.publicApi = publicApi;
        this.internalApi = internalApi;
        this.secret = secret == null ? "" : secret;
        this.db = db;
        this.json = json;
        this.tx = tx;
    }

    private static JdkClientHttpRequestFactory timeouts() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(2));
        return factory;
    }

    /** Request shape: {} (the best offer that applies by itself) or {"code": "<4-20 letters or digits>"}. Returns the code or null. */
    public static String parse(JsonNode request) {
        if (!request.isObject() || request.size() > 1 || (request.size() == 1 && !request.has("code"))) {
            throw OrderApiException.badRequest("INVALID_PROMOTION", "promotion may only carry a code");
        }
        JsonNode code = request.path("code");
        if (code.isMissingNode() || code.isNull()) return null;
        if (!code.isTextual() || !code.asText().matches(CODE)) throw OrderApiException.badRequest("INVALID_PROMOTION", "Invalid promotion code");
        return code.asText();
    }

    /** Runs inside the checkout transaction: any refusal rolls the checkout back and keeps the cart. */
    public void reserve(CheckoutResponse checkout, String code, String authorization) {
        if (authorization == null || authorization.isBlank()) {
            throw OrderApiException.conflict("PROMOTION_UNCONFIRMED", "A promotion needs the customer's own sign-in");
        }
        if (internalApi == null || secret.isBlank()) throw unavailable();
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        checkout.orders().forEach(order -> order.items().forEach(item -> quantities.merge(item.menuItemId(), item.quantity(), Integer::sum)));
        if (quantities.size() > 50 || quantities.values().stream().anyMatch(q -> q > 100)) {
            throw OrderApiException.conflict("PROMOTION_CART_TOO_LARGE", "Promotions apply to carts of up to 50 dishes, 100 of each");
        }
        ObjectNode body = json.createObjectNode();
        if (code != null) body.put("code", code);
        var items = body.putArray("items");
        quantities.forEach((dish, quantity) -> items.addObject().put("menuItemId", dish.toString()).put("quantity", quantity));
        JsonNode redemption;
        try {
            redemption = publicApi.post().uri("/api/v1/advanced/promotions/redemptions").header(HttpHeaders.AUTHORIZATION, authorization)
                .header("Idempotency-Key", checkout.id().toString()).contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException e) {
            int status = e.getStatusCode().value();
            if (status == 401 || status == 403 || status == 429) throw unavailable();
            String problem = code(e);
            throw OrderApiException.conflict(problem.isEmpty() ? "PROMOTION_REFUSED" : problem, "This offer cannot be used for this order");
        } catch (RestClientException e) {
            throw unavailable();
        }
        if (redemption == null || !redemption.path("id").isTextual()) throw unavailable();
        UUID redemptionId = uuid(redemption, "id");
        UUID customer = checkout.customerIdentityId();
        try {
            JsonNode terms = internalApi.get().uri("/internal/v1/promotions/redemptions/{id}/checkout-terms?personId={person}", redemptionId, customer)
                .header("X-Craves-Internal-Secret", secret).retrieve().body(JsonNode.class);
            long discount = redemption.path("discountPaise").asLong(-1);
            long gross = paise(checkout.grandTotal());
            UUID promotion = uuid(redemption, "promotionId");
            if (!redemptionId.equals(uuid(terms, "id")) || !promotion.equals(uuid(terms, "promotionId")) || discount != terms.path("discountPaise").asLong(-2)
                || !customer.equals(uuid(redemption, "personId")) || !"RESERVED".equals(redemption.path("status").asText())) {
                throw OrderApiException.serviceUnavailable("PROMOTION_CONTEXT_MISMATCH", "The offer could not be checked right now. Please try again.");
            }
            if (!"CRAVES".equals(terms.path("fundedBy").asText())) {
                throw OrderApiException.conflict("PROMOTION_NOT_SUPPORTED", "This offer cannot be used at checkout yet");
            }
            if (redemption.path("subtotalPaise").asLong(-1) != paise(checkout.foodSubtotal())) {
                throw OrderApiException.conflict("PROMOTION_PRICE_CHANGED", "Prices changed while applying the offer. Please try again.");
            }
            if (discount <= 0 || discount > paise(checkout.foodSubtotal()) || discount > gross) {
                throw OrderApiException.conflict("PROMOTION_AMOUNT_INVALID", "This offer cannot be used for this order");
            }
            db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, "promotion-checkout/" + customer);
            // A checkout left unpaid past the payment window stops counting (its row stays RESERVED, so a late payment still confirms).
            int used = db.queryForObject("SELECT count(*) FROM order_schema.promotion_checkout_benefit b JOIN order_schema.checkout c ON c.id = b.checkout_id "
                + "WHERE b.customer_id = ? AND b.promotion_id = ? AND b.state <> 'RELEASED' "
                + "AND NOT (b.state = 'RESERVED' AND c.status <> 'PAID' AND b.created_at < now() - (? * interval '1 minute'))",
                Integer.class, customer, promotion, unpaidMinutes);
            int limit = terms.path("perPersonLimit").asInt(0);
            if (limit < 1 || used >= limit) throw OrderApiException.conflict("PROMO_PERSON_LIMIT", "You have already used this offer");
            db.update("INSERT INTO order_schema.promotion_checkout_benefit(checkout_id, customer_id, redemption_id, promotion_id, discount_paise, gross_paise) VALUES (?,?,?,?,?,?)",
                checkout.id(), customer, redemptionId, promotion, discount, gross);
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                // A later step (batch holds, the commit) may still roll the checkout back: then give the reservation back too.
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) releaseQuietly(redemptionId, customer);
                    }
                });
            }
        } catch (RuntimeException e) {
            releaseQuietly(redemptionId, customer); // otherwise the customer's retry meets PROMO_RESERVATION_EXISTS until it lapses
            if (e instanceof OrderApiException) throw e;
            throw unavailable();
        }
    }

    /** Called by the paid callback in its own work: the worker then confirms in M08. Works while the runtime is off too. */
    static void markPaid(JdbcTemplate db, UUID checkout) {
        db.update("UPDATE order_schema.promotion_checkout_benefit SET state = 'CONFIRMING', attempts = 0, next_attempt_at = now(), updated_at = now() "
            + "WHERE checkout_id = ? AND state = 'RESERVED' AND EXISTS (SELECT 1 FROM order_schema.checkout c WHERE c.id = ? AND c.status = 'PAID')", checkout, checkout);
    }

    /** What Finance (and the customer) read: state NONE when the checkout carries no promotion. Money as exact paise strings. */
    public static JsonNode read(JdbcTemplate db, ObjectMapper json, UUID checkout) {
        var rows = db.queryForList("SELECT * FROM order_schema.promotion_checkout_benefit WHERE checkout_id = ?", checkout);
        if (rows.isEmpty()) return json.createObjectNode().put("state", "NONE");
        var row = rows.getFirst();
        long gross = ((Number) row.get("gross_paise")).longValue(), discount = ((Number) row.get("discount_paise")).longValue();
        return json.createObjectNode().put("state", row.get("state").toString()).put("redemptionId", row.get("redemption_id").toString())
            .put("promotionId", row.get("promotion_id").toString()).put("fundedBy", "CRAVES").put("grossPaise", Long.toString(gross))
            .put("discountPaise", Long.toString(discount)).put("netPaise", Long.toString(gross - discount));
    }

    @Scheduled(scheduler = in.craves.order.config.WorkerSchedulingConfiguration.PROMOTION_SCHEDULER, fixedDelayString = "${CRAVES_ADVANCED_CHECKOUT_PROMOTIONS_POLL_MS:5000}")
    public void tick() {
        for (int i = 0; i < 20; i++) if (!runOne()) return;
    }

    record Work(UUID checkout, UUID lease, String stage, UUID redemption, UUID customer, int attempts) { }

    public boolean runOne() {
        Work work = claim();
        if (work == null) return false;
        boolean confirm = work.stage().equals("CONFIRMING");
        ObjectNode body = json.createObjectNode().put("personId", work.customer().toString());
        // M08's orderId holds the checkout id: one promotion per checkout. A release names it too, which M08 needs for a confirmed one.
        body.put("orderId", work.checkout().toString());
        try {
            if (internalApi == null || secret.isBlank()) throw new IllegalStateException("not configured");
            JsonNode answer = internalApi.post().uri("/internal/v1/promotions/redemptions/{id}/" + (confirm ? "confirm" : "release"), work.redemption())
                .header("X-Craves-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            String expected = confirm ? "CONFIRMED" : "RELEASED";
            if (answer == null || !work.redemption().toString().equals(answer.path("id").asText()) || !expected.equals(answer.path("status").asText())) {
                finish(work, "REVIEW", "CONTEXT_MISMATCH");
            } else {
                finish(work, expected, null);
            }
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            // 401/403 mean our own secret or route is wrong: retry rather than flood REVIEW.
            if (status >= 400 && status < 500 && status != 401 && status != 403 && status != 408 && status != 429) {
                String problem = code(e);
                finish(work, "REVIEW", problem.isEmpty() ? "HTTP_" + status : problem); // lapsed, used elsewhere, erased: staff decide
            } else {
                retryLater(work);
            }
        } catch (RuntimeException e) {
            retryLater(work);
        }
        return true;
    }

    private Work claim() {
        return tx.execute(status -> {
            // A paid checkout whose paid hook was lost (crash between the two commits) is confirmed anyway.
            db.update("UPDATE order_schema.promotion_checkout_benefit b SET state = 'CONFIRMING', attempts = 0, next_attempt_at = now(), updated_at = now() "
                + "FROM order_schema.checkout c WHERE c.id = b.checkout_id AND b.state = 'RESERVED' AND c.status = 'PAID'");
            // A checkout cancelled before payment gives its reservation back.
            db.update("UPDATE order_schema.promotion_checkout_benefit b SET state = 'RELEASING', attempts = 0, next_attempt_at = now(), updated_at = now() "
                + "FROM order_schema.checkout c WHERE c.id = b.checkout_id AND b.state = 'RESERVED' AND c.status = 'CANCELLED'");
            if (System.nanoTime() - nextCancelledSweep >= 0) {
                nextCancelledSweep = System.nanoTime() + Duration.ofMinutes(1).toNanos();
                releaseCancelledBeforeFulfilment();
            }
            var rows = db.queryForList("SELECT * FROM order_schema.promotion_checkout_benefit WHERE state IN ('CONFIRMING','RELEASING') AND next_attempt_at <= now() "
                + "AND (lease_until IS NULL OR lease_until <= now()) ORDER BY next_attempt_at, checkout_id LIMIT 1 FOR UPDATE SKIP LOCKED");
            if (rows.isEmpty()) return null;
            var row = rows.getFirst();
            UUID lease = UUID.randomUUID(), checkout = (UUID) row.get("checkout_id");
            db.update("UPDATE order_schema.promotion_checkout_benefit SET lease_id = ?, lease_until = now() + interval '60 seconds', attempts = attempts + 1, updated_at = now() WHERE checkout_id = ?",
                lease, checkout);
            return new Work(checkout, lease, row.get("state").toString(), (UUID) row.get("redemption_id"), (UUID) row.get("customer_id"),
                ((Number) row.get("attempts")).intValue() + 1);
        });
    }

    /**
     * Slice 3c: a paid checkout whose chef orders were all cancelled, rejected or refunded before any chef accepted (ready_at is
     * set on acceptance, and an accepted order goes straight to READY_FOR_PICKUP) gives its confirmed redemption back to M08, so the
     * promotion's budget and the person's limit come back. Refunds are not touched (Finance returns only the customer's own cash,
     * slice 3b). One accepted chef order keeps the promotion used. Only checkouts confirmed in the last 30 days are looked at.
     * shortcut: scans those CONFIRMED rows once a minute per replica; add a partial index or a cancellation hook when that grows large.
     */
    private void releaseCancelledBeforeFulfilment() {
        db.update("UPDATE order_schema.promotion_checkout_benefit b SET state = 'RELEASING', attempts = 0, next_attempt_at = now(), updated_at = now() "
            + "FROM order_schema.checkout c WHERE c.id = b.checkout_id AND b.state = 'CONFIRMED' AND c.status = 'PAID' AND b.updated_at > now() - interval '30 days' "
            + "AND EXISTS (SELECT 1 FROM order_schema.customer_order o WHERE o.checkout_id = b.checkout_id) "
            + "AND NOT EXISTS (SELECT 1 FROM order_schema.customer_order o WHERE o.checkout_id = b.checkout_id AND ("
            + "o.status NOT IN ('CANCELLED','CHEF_REJECTED','REFUND_PENDING','REFUNDED','REFUND_FAILED') "
            + "OR o.ready_at IS NOT NULL OR o.chef_handed_over_at IS NOT NULL "
            + "OR EXISTS (SELECT 1 FROM order_schema.order_status_history h WHERE h.order_id = o.id AND h.new_status IN "
            + "('READY_FOR_PICKUP','PICKED_UP','OUT_FOR_DELIVERY','ARRIVED_AT_DROP','DELIVERED','DELIVERY_FAILED'))))");
    }

    private void finish(Work work, String state, String code) {
        db.update("UPDATE order_schema.promotion_checkout_benefit SET state = ?, last_code = ?, lease_id = NULL, lease_until = NULL, updated_at = now() "
            + "WHERE checkout_id = ? AND lease_id = ?", state, code, work.checkout(), work.lease());
    }

    private void retryLater(Work work) {
        db.update("UPDATE order_schema.promotion_checkout_benefit SET state = ?, last_code = 'OPERATION_UNCONFIRMED', next_attempt_at = now() + (? * interval '1 second'), "
            + "lease_id = NULL, lease_until = NULL, updated_at = now() WHERE checkout_id = ? AND lease_id = ?",
            work.attempts() >= MAX_ATTEMPTS ? "REVIEW" : work.stage(), Math.min(3600, 1L << Math.min(work.attempts(), 11)), work.checkout(), work.lease());
    }

    private void releaseQuietly(UUID redemption, UUID customer) {
        try {
            internalApi.post().uri("/internal/v1/promotions/redemptions/{id}/release", redemption).header("X-Craves-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON).body(json.createObjectNode().put("personId", customer.toString())).retrieve().toBodilessEntity();
        } catch (RuntimeException ignored) {
            // shortcut: an unreleased reservation lapses after M08's reservation time; retry here if customers report it.
        }
    }

    private static String code(RestClientResponseException e) {
        try {
            String code = e.getResponseBodyAs(JsonNode.class) instanceof JsonNode problem ? problem.path("code").asText("") : "";
            return code.matches("[A-Z_]{1,40}") ? code : "";
        } catch (RuntimeException notJson) {
            return "";
        }
    }

    private static UUID uuid(JsonNode node, String field) {
        try {
            return UUID.fromString(node.path(field).asText());
        } catch (RuntimeException e) {
            throw new IllegalStateException("PROMOTION_ANSWER_INVALID");
        }
    }

    static long paise(BigDecimal amount) {
        return amount.movePointRight(2).longValueExact();
    }

    private static OrderApiException unavailable() {
        return OrderApiException.serviceUnavailable("PROMOTIONS_UNAVAILABLE", "Offers cannot be applied right now. Please try again.");
    }
}
