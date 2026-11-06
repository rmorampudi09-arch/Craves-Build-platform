package in.craves.integration.promotions;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.config.OrderClientProperties;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

/**
 * M24a slice 3: the checkout's original prices stay as quoted; a Craves-funded promotion only lowers what the provider collects.
 * Finance freezes order-service's promotion (V42) once, before the first provider order, and collects gross - discount.
 * New promotions are read only while CRAVES_ADVANCED_CHECKOUT_PROMOTIONS_ENABLED=true (otherwise no call to order-service);
 * an amount already frozen is always honoured, so switching Finance off never charges a frozen promotion checkout the gross.
 */
@Service
public class PromotionCheckoutFundingService {
    private static final Set<String> PAYABLE = Set.of("RESERVED", "CONFIRMING", "CONFIRMED");
    private final JdbcTemplate db;
    private final RestClient internal;
    private final String internalKey;
    private final boolean enabled;

    public PromotionCheckoutFundingService(JdbcTemplate db, OrderClientProperties config, RestClient.Builder builder,
                                           @Value("${CRAVES_ADVANCED_CHECKOUT_PROMOTIONS_ENABLED:false}") boolean enabled) {
        this.db = db;
        this.enabled = enabled;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.internal = builder.clone().baseUrl(config.internalBaseUrl()).requestFactory(factory).build();
        this.internalKey = config.internalKey();
    }

    /** Net amount to collect, or null when the checkout carries no promotion. Runs inside the payment-creation transaction. */
    public BigDecimal prepare(UUID checkout, UUID buyer, BigDecimal grandTotal, String currency) {
        var frozenRow = db.queryForList("SELECT buyer_id,gross_paise,net_paise FROM payment_schema.promotion_checkout_funding WHERE checkout_id=?", checkout);
        if (!frozenRow.isEmpty() && Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.payment_order WHERE checkout_id=?)", Boolean.class, checkout))) {
            // Collection already started on the frozen amount: keep it, whatever the switch or the redemption says now.
            var r = frozenRow.getFirst();
            if (!buyer.equals(r.get("buyer_id")) || grandTotal.compareTo(BigDecimal.valueOf(number(r.get("gross_paise")), 2)) != 0) throw conflict("Frozen promotion funding differs from the checkout");
            return BigDecimal.valueOf(number(r.get("net_paise")), 2);
        }
        if (!enabled) return null;
        JsonNode p;
        try {
            p = internal.get().uri("/payments/checkout/{id}/promotion", checkout).header("X-Craves-Internal-Secret", internalKey).retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Checkout promotion could not be read");
        }
        if (p == null || !p.path("state").isTextual()) throw conflict("Checkout promotion answer is invalid");
        String state = p.path("state").asText();
        boolean frozen = exists(checkout);
        if ("NONE".equals(state)) {
            if (frozen) throw conflict("Frozen promotion is missing from order-service");
            return null;
        }
        if (!PAYABLE.contains(state)) throw conflict("Checkout promotion is not payable (" + state + ")");
        if (!"INR".equals(currency) || !"CRAVES".equals(p.path("fundedBy").asText())) throw conflict("Only Craves-funded INR promotions are supported");
        long gross = paise(p, "grossPaise"), discount = paise(p, "discountPaise"), net = paise(p, "netPaise");
        UUID redemption = uuid(p, "redemptionId"), promotion = uuid(p, "promotionId");
        if (grandTotal.compareTo(BigDecimal.valueOf(gross, 2)) != 0 || gross != Math.addExact(discount, net) || discount <= 0) throw conflict("Promotion funding differs from the checkout");
        if (net <= 0) throw conflict("A promotion that covers the whole checkout is not supported; check out without it");
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", rs -> null, "promotion-funding/" + checkout);
        var old = db.queryForList("SELECT buyer_id,redemption_id,gross_paise,discount_paise,net_paise FROM payment_schema.promotion_checkout_funding WHERE checkout_id=?", checkout);
        if (!old.isEmpty()) {
            var r = old.getFirst();
            if (!buyer.equals(r.get("buyer_id")) || !redemption.equals(r.get("redemption_id")) || gross != number(r.get("gross_paise")) || discount != number(r.get("discount_paise"))) throw conflict("Frozen promotion funding changed");
            return BigDecimal.valueOf(net, 2);
        }
        if (Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.payment_order WHERE checkout_id=?)", Boolean.class, checkout))) throw conflict("Payment collection was already started without the promotion");
        var quotes = db.queryForList("SELECT response->>'total' AS total,customer_identity_id FROM payment_schema.finance_checkout_quote WHERE checkout_id=?", checkout);
        if (quotes.size() != 1 || !buyer.equals(quotes.getFirst().get("customer_identity_id")) || new BigDecimal(quotes.getFirst().get("total").toString()).compareTo(grandTotal) != 0) throw conflict("Original Finance quote is missing or changed");
        db.update("INSERT INTO payment_schema.promotion_checkout_funding(checkout_id,buyer_id,redemption_id,promotion_id,gross_paise,discount_paise,net_paise) VALUES (?,?,?,?,?,?,?)", checkout, buyer, redemption, promotion, gross, discount, net);
        return BigDecimal.valueOf(net, 2);
    }

    public boolean exists(UUID checkout) {
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.promotion_checkout_funding WHERE checkout_id=?)", Boolean.class, checkout));
    }

    private static long paise(JsonNode p, String field) {
        if (!p.path(field).isTextual() || !p.path(field).asText().matches("0|[1-9][0-9]{0,12}")) throw conflict("Exact promotion paise required");
        return Long.parseLong(p.path(field).asText());
    }

    private static UUID uuid(JsonNode p, String field) {
        try { return UUID.fromString(p.path(field).asText()); } catch (IllegalArgumentException e) { throw conflict("Promotion identity required"); }
    }

    private static long number(Object value) { return ((Number) value).longValue(); }

    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
