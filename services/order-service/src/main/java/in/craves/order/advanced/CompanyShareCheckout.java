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
 * M24d slice 2: a checkout may carry {@code companyCharge: {"kind"?: "MEAL"|"TEAM_MEAL", "headcount"?}}. Order-service reserves the
 * company's share in M10 with the customer's own token inside the checkout transaction (Idempotency-Key = checkout id), keeps it only if
 * M10 priced the same food subtotal and the reservation is live and the customer's own, and freezes it. Finance reads the share through
 * {@link CompanyShareCheckoutController} and charges the person the rest; after the paid callback a worker confirms it in M10 with the
 * internal secret, and a checkout cancelled before payment, or paid but cancelled before any chef accepted, releases it. Every answer
 * other than 200 from those calls goes to REVIEW: the person is never charged the difference silently.
 */
@Service
@ConditionalOnProperty(name = "CRAVES_ADVANCED_CHECKOUT_COMPANY_SHARE_ENABLED", havingValue = "true")
public class CompanyShareCheckout {
    static final int MAX_ATTEMPTS = 20;
    private final RestClient publicApi;
    private final RestClient internalApi;
    private final String secret;
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private long nextCancelledSweep = System.nanoTime();

    @Autowired
    public CompanyShareCheckout(RestClient.Builder builder, JdbcTemplate db, ObjectMapper json, PlatformTransactionManager manager,
                             @Value("${CRAVES_ADVANCED_BASE_URL:https://api.craves.in}") String baseUrl,
                             @Value("${CRAVES_ADVANCED_INTERNAL_BASE_URL:}") String internalBaseUrl,
                             @Value("${CRAVES_ADVANCED_INTERNAL_SECRET:}") String secret) {
        this(builder.clone().baseUrl(baseUrl).requestFactory(timeouts()).build(),
            internalBaseUrl.isBlank() ? null : builder.clone().baseUrl(internalBaseUrl).requestFactory(timeouts()).build(),
            secret, db, json, new TransactionTemplate(manager));
    }

    CompanyShareCheckout(RestClient publicApi, RestClient internalApi, String secret, JdbcTemplate db, ObjectMapper json, TransactionTemplate tx) {
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

    /** Request shape: {} or {"kind": "MEAL"} (the person's own meal) or {"kind": "TEAM_MEAL", "headcount": 2-100000} (managers). M10 checks the rest. */
    public static ObjectNode parse(JsonNode request) {
        if (!request.isObject() || request.size() > 2) throw invalid();
        request.fieldNames().forEachRemaining(name -> { if (!name.equals("kind") && !name.equals("headcount")) throw invalid(); });
        JsonNode kind = request.path("kind"), headcount = request.path("headcount");
        String meal = kind.isMissingNode() || kind.isNull() ? "MEAL" : kind.isTextual() ? kind.asText() : "";
        if (!meal.equals("MEAL") && !meal.equals("TEAM_MEAL")) throw invalid();
        ObjectNode parsed = new ObjectMapper().createObjectNode().put("kind", meal);
        if (headcount.isMissingNode() || headcount.isNull()) return parsed;
        if (!meal.equals("TEAM_MEAL") || !headcount.canConvertToInt() || !headcount.isIntegralNumber() || headcount.asInt() < 2 || headcount.asInt() > 100_000) throw invalid();
        return parsed.put("headcount", headcount.asInt());
    }

    private static OrderApiException invalid() {
        return OrderApiException.badRequest("INVALID_COMPANY_CHARGE", "companyCharge may only carry kind (MEAL or TEAM_MEAL) and a team meal's headcount");
    }

    /** Runs inside the checkout transaction: any refusal rolls the checkout back and keeps the cart. */
    public void reserve(CheckoutResponse checkout, ObjectNode charge, String authorization) {
        if (authorization == null || authorization.isBlank()) {
            throw OrderApiException.conflict("COMPANY_SHARE_UNCONFIRMED", "A company payment needs the customer's own sign-in");
        }
        if (internalApi == null || secret.isBlank()) throw unavailable();
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        checkout.orders().forEach(order -> order.items().forEach(item -> quantities.merge(item.menuItemId(), item.quantity(), Integer::sum)));
        if (quantities.size() > 50 || quantities.values().stream().anyMatch(q -> q > 100)) {
            throw OrderApiException.conflict("COMPANY_SHARE_CART_TOO_LARGE", "Company payments apply to carts of up to 50 dishes, 100 of each");
        }
        ObjectNode body = charge.deepCopy();
        var items = body.putArray("items");
        quantities.forEach((dish, quantity) -> items.addObject().put("menuItemId", dish.toString()).put("quantity", quantity));
        JsonNode reserved;
        try {
            reserved = publicApi.post().uri("/api/v1/advanced/corporate-meals/charges").header(HttpHeaders.AUTHORIZATION, authorization)
                .header("Idempotency-Key", checkout.id().toString()).contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException e) {
            int status = e.getStatusCode().value();
            if (status == 401 || status == 403 || status == 429) throw unavailable();
            String problem = code(e);
            throw OrderApiException.conflict(problem.isEmpty() ? "COMPANY_SHARE_REFUSED" : problem, "Your company cannot pay for this order");
        } catch (RestClientException e) {
            throw unavailable();
        }
        if (reserved == null || !reserved.path("id").isTextual()) throw unavailable();
        UUID chargeId = uuid(reserved, "id");
        UUID customer = checkout.customerIdentityId();
        try {
            // The terms read proves the charge is this customer's (another person's answers 404) and is read from M10's own record.
            JsonNode terms = internalApi.get().uri("/internal/v1/corporate-meals/charges/{id}/checkout-terms?personId={person}", chargeId, customer)
                .header("X-Craves-Internal-Secret", secret).retrieve().body(JsonNode.class);
            long share = reserved.path("companySharePaise").asLong(-1);
            long subtotal = reserved.path("subtotalPaise").asLong(-1);
            long gross = paise(checkout.grandTotal());
            UUID company = uuid(reserved, "companyId");
            if (!chargeId.equals(uuid(terms, "id")) || !company.equals(uuid(terms, "companyId")) || share != terms.path("companySharePaise").asLong(-2)
                || subtotal != terms.path("subtotalPaise").asLong(-2) || !"RESERVED".equals(terms.path("status").asText())
                || !"RESERVED".equals(reserved.path("status").asText()) || !terms.path("orderId").isNull() && !terms.path("orderId").isMissingNode()) {
                throw OrderApiException.serviceUnavailable("COMPANY_SHARE_CONTEXT_MISMATCH", "The company payment could not be checked right now. Please try again.");
            }
            java.time.Instant expires;
            try {
                expires = java.time.Instant.parse(terms.path("expiresAt").asText());
            } catch (RuntimeException e) {
                throw new IllegalStateException("COMPANY_SHARE_ANSWER_INVALID");
            }
            if (!expires.isAfter(java.time.Instant.now())) throw unavailable();
            // M10 prices at Catalog's live prices without option add-ons; options are refused with a company share, so these must match.
            if (subtotal != paise(checkout.foodSubtotal())) {
                throw OrderApiException.conflict("COMPANY_SHARE_PRICE_CHANGED", "Prices changed while applying your company payment. Please try again.");
            }
            if (share <= 0 || share > subtotal || share > gross) {
                throw OrderApiException.conflict("COMPANY_SHARE_AMOUNT_INVALID", "Your company cannot pay for this order");
            }
            db.update("INSERT INTO order_schema.company_share_checkout_benefit(checkout_id, customer_id, charge_id, company_id, share_paise, gross_paise) VALUES (?,?,?,?,?,?)",
                checkout.id(), customer, chargeId, company, share, gross);
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                // A later step (batch holds, the commit) may still roll the checkout back: then give the reservation back too.
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) releaseQuietly(chargeId, customer);
                    }
                });
            }
        } catch (RuntimeException e) {
            releaseQuietly(chargeId, customer); // otherwise the customer's retry meets CHARGE_RESERVATION_EXISTS until it lapses
            if (e instanceof OrderApiException) throw e;
            throw unavailable();
        }
    }

    /** Called by the paid callback in its own work: the worker then confirms in M10. Works while the runtime is off too. */
    static void markPaid(JdbcTemplate db, UUID checkout) {
        db.update("UPDATE order_schema.company_share_checkout_benefit SET state = 'CONFIRMING', attempts = 0, next_attempt_at = now(), updated_at = now() "
            + "WHERE checkout_id = ? AND state = 'RESERVED' AND EXISTS (SELECT 1 FROM order_schema.checkout c WHERE c.id = ? AND c.status = 'PAID')", checkout, checkout);
    }

    /** What Finance (and the customer) read: state NONE when the checkout carries no company share. Money as exact paise strings. */
    public static JsonNode read(JdbcTemplate db, ObjectMapper json, UUID checkout) {
        var rows = db.queryForList("SELECT * FROM order_schema.company_share_checkout_benefit WHERE checkout_id = ?", checkout);
        if (rows.isEmpty()) return json.createObjectNode().put("state", "NONE");
        var row = rows.getFirst();
        long gross = ((Number) row.get("gross_paise")).longValue(), share = ((Number) row.get("share_paise")).longValue();
        return json.createObjectNode().put("state", row.get("state").toString()).put("chargeId", row.get("charge_id").toString())
            .put("companyId", row.get("company_id").toString()).put("grossPaise", Long.toString(gross))
            .put("companySharePaise", Long.toString(share)).put("personPaise", Long.toString(gross - share));
    }

    @Scheduled(scheduler = in.craves.order.config.WorkerSchedulingConfiguration.COMPANY_SHARE_SCHEDULER, fixedDelayString = "${CRAVES_ADVANCED_CHECKOUT_COMPANY_SHARE_POLL_MS:5000}")
    public void tick() {
        for (int i = 0; i < 20; i++) if (!runOne()) return;
    }

    record Work(UUID checkout, UUID lease, String stage, UUID charge, UUID customer, int attempts) { }

    public boolean runOne() {
        Work work = claim();
        if (work == null) return false;
        boolean confirm = work.stage().equals("CONFIRMING");
        ObjectNode body = json.createObjectNode().put("personId", work.customer().toString());
        // M10's orderId holds the checkout id: one company share per checkout. A release names it too, so a late paid callback cannot revive it.
        body.put("orderId", work.checkout().toString());
        try {
            if (internalApi == null || secret.isBlank()) throw new IllegalStateException("not configured");
            JsonNode answer = internalApi.post().uri("/internal/v1/corporate-meals/charges/{id}/" + (confirm ? "confirm" : "release"), work.charge())
                .header("X-Craves-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            String expected = confirm ? "CONFIRMED" : "RELEASED";
            if (answer == null || !work.charge().toString().equals(answer.path("id").asText()) || !expected.equals(answer.path("status").asText())) {
                finish(work, "REVIEW", "CONTEXT_MISMATCH");
            } else {
                finish(work, expected, null);
            }
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            // 401/403 mean our own secret or route is wrong: retry rather than flood REVIEW.
            if (status >= 400 && status < 500 && status != 401 && status != 403 && status != 408 && status != 429) {
                String problem = code(e);
                finish(work, "REVIEW", problem.isEmpty() ? "HTTP_" + status : problem); // lapsed without room, voided, erased: staff decide
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
            db.update("UPDATE order_schema.company_share_checkout_benefit b SET state = 'CONFIRMING', attempts = 0, next_attempt_at = now(), updated_at = now() "
                + "FROM order_schema.checkout c WHERE c.id = b.checkout_id AND b.state = 'RESERVED' AND c.status = 'PAID'");
            // A checkout cancelled before payment gives its reservation back.
            db.update("UPDATE order_schema.company_share_checkout_benefit b SET state = 'RELEASING', attempts = 0, next_attempt_at = now(), updated_at = now() "
                + "FROM order_schema.checkout c WHERE c.id = b.checkout_id AND b.state = 'RESERVED' AND c.status = 'CANCELLED'");
            if (System.nanoTime() - nextCancelledSweep >= 0) {
                nextCancelledSweep = System.nanoTime() + Duration.ofMinutes(1).toNanos();
                releaseCancelledBeforeFulfilment();
            }
            var rows = db.queryForList("SELECT * FROM order_schema.company_share_checkout_benefit WHERE state IN ('CONFIRMING','RELEASING') AND next_attempt_at <= now() "
                + "AND (lease_until IS NULL OR lease_until <= now()) ORDER BY next_attempt_at, checkout_id LIMIT 1 FOR UPDATE SKIP LOCKED");
            if (rows.isEmpty()) return null;
            var row = rows.getFirst();
            UUID lease = UUID.randomUUID(), checkout = (UUID) row.get("checkout_id");
            db.update("UPDATE order_schema.company_share_checkout_benefit SET lease_id = ?, lease_until = now() + interval '60 seconds', attempts = attempts + 1, updated_at = now() WHERE checkout_id = ?",
                lease, checkout);
            return new Work(checkout, lease, row.get("state").toString(), (UUID) row.get("charge_id"), (UUID) row.get("customer_id"),
                ((Number) row.get("attempts")).intValue() + 1);
        });
    }

    /**
     * As M24a slice 3c: a paid checkout whose chef orders were all cancelled, rejected or refunded before any chef accepted gives its
     * confirmed company share back to M10, so the company's month budget and the person's meals come back. Refunds are slice 3
     * (integration-service). One accepted chef order keeps the share used. Only checkouts confirmed in the last 30 days are looked at.
     * shortcut: scans those CONFIRMED rows once a minute per replica; add a partial index or a cancellation hook when that grows large.
     */
    private void releaseCancelledBeforeFulfilment() {
        db.update("UPDATE order_schema.company_share_checkout_benefit b SET state = 'RELEASING', attempts = 0, next_attempt_at = now(), updated_at = now() "
            + "FROM order_schema.checkout c WHERE c.id = b.checkout_id AND b.state = 'CONFIRMED' AND c.status = 'PAID' AND b.updated_at > now() - interval '30 days' "
            + "AND EXISTS (SELECT 1 FROM order_schema.customer_order o WHERE o.checkout_id = b.checkout_id) "
            + "AND NOT EXISTS (SELECT 1 FROM order_schema.customer_order o WHERE o.checkout_id = b.checkout_id AND ("
            + "o.status NOT IN ('CANCELLED','CHEF_REJECTED','REFUND_PENDING','REFUNDED','REFUND_FAILED') "
            + "OR o.ready_at IS NOT NULL OR o.chef_handed_over_at IS NOT NULL "
            + "OR EXISTS (SELECT 1 FROM order_schema.order_status_history h WHERE h.order_id = o.id AND h.new_status IN "
            + "('READY_FOR_PICKUP','PICKED_UP','OUT_FOR_DELIVERY','ARRIVED_AT_DROP','DELIVERED','DELIVERY_FAILED'))))");
    }

    private void finish(Work work, String state, String code) {
        db.update("UPDATE order_schema.company_share_checkout_benefit SET state = ?, last_code = ?, lease_id = NULL, lease_until = NULL, updated_at = now() "
            + "WHERE checkout_id = ? AND lease_id = ?", state, code, work.checkout(), work.lease());
    }

    private void retryLater(Work work) {
        db.update("UPDATE order_schema.company_share_checkout_benefit SET state = ?, last_code = 'OPERATION_UNCONFIRMED', next_attempt_at = now() + (? * interval '1 second'), "
            + "lease_id = NULL, lease_until = NULL, updated_at = now() WHERE checkout_id = ? AND lease_id = ?",
            work.attempts() >= MAX_ATTEMPTS ? "REVIEW" : work.stage(), Math.min(3600, 1L << Math.min(work.attempts(), 11)), work.checkout(), work.lease());
    }

    private void releaseQuietly(UUID charge, UUID customer) {
        try {
            internalApi.post().uri("/internal/v1/corporate-meals/charges/{id}/release", charge).header("X-Craves-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON).body(json.createObjectNode().put("personId", customer.toString())).retrieve().toBodilessEntity();
        } catch (RuntimeException ignored) {
            // shortcut: an unreleased reservation lapses after M10's 10-minute reservation time; retry here if customers report it.
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
            throw new IllegalStateException("COMPANY_SHARE_ANSWER_INVALID");
        }
    }

    static long paise(BigDecimal amount) {
        return amount.movePointRight(2).longValueExact();
    }

    private static OrderApiException unavailable() {
        return OrderApiException.serviceUnavailable("COMPANY_SHARE_UNAVAILABLE", "Your company payment cannot be applied right now. Please try again.");
    }
}
