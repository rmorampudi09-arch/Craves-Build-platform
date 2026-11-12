package in.craves.integration.corporatemeals;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.config.OrderClientProperties;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

/**
 * M24d slice 3: the checkout keeps its quoted prices (chef paid in full, GST on the full price); the company's M10 share only
 * lowers what the person pays the provider. Finance freezes order-service's share (V44) once, before the first provider order,
 * after re-reading M10's own record of the charge: it must still be RESERVED and unexpired (or CONFIRMED for this checkout),
 * so a lapsed reservation never leaves the person paying only their part with nobody paying the company's share.
 * New shares are read only while CRAVES_ADVANCED_CHECKOUT_COMPANY_SHARE_ENABLED=true; a frozen amount is always honoured.
 */
@Service
public class CompanyShareCheckoutFundingService {
    private static final Set<String> PAYABLE = Set.of("RESERVED", "CONFIRMING", "CONFIRMED");
    private final JdbcTemplate db;
    private final RestClient orders;
    private final RestClient advanced;
    private final String orderKey;
    private final String advancedSecret;
    private final boolean enabled;
    private final Clock clock;

    @Autowired
    public CompanyShareCheckoutFundingService(JdbcTemplate db, OrderClientProperties config, RestClient.Builder builder,
                                              @Value("${CRAVES_ADVANCED_CHECKOUT_COMPANY_SHARE_ENABLED:false}") boolean enabled,
                                              @Value("${CRAVES_ADVANCED_INTERNAL_BASE_URL:}") String advancedBaseUrl,
                                              @Value("${CRAVES_ADVANCED_INTERNAL_SECRET:}") String advancedSecret) {
        this(db, config, builder, enabled, advancedBaseUrl, advancedSecret, Clock.systemUTC());
    }

    public CompanyShareCheckoutFundingService(JdbcTemplate db, OrderClientProperties config, RestClient.Builder builder, boolean enabled,
                                              String advancedBaseUrl, String advancedSecret, Clock clock) {
        this.db = db;
        this.enabled = enabled;
        this.clock = clock;
        this.orders = builder.clone().baseUrl(config.internalBaseUrl()).requestFactory(timeouts(10)).build();
        this.advanced = advancedBaseUrl == null || advancedBaseUrl.isBlank() ? null : builder.clone().baseUrl(advancedBaseUrl).requestFactory(timeouts(3)).build();
        this.orderKey = config.internalKey();
        this.advancedSecret = advancedSecret == null ? "" : advancedSecret;
    }

    // Both calls run inside the payment transaction (a held DB connection): M10's answer is small, so it gets a shorter deadline.
    private static JdkClientHttpRequestFactory timeouts(int readSeconds) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(Math.min(5, readSeconds))).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(readSeconds));
        return factory;
    }

    /** What the person pays, or null when the checkout carries no company share. Runs inside the payment-creation transaction. */
    public BigDecimal prepare(UUID checkout, UUID buyer, BigDecimal grandTotal, String currency) {
        var frozenRow = db.queryForList("SELECT buyer_id,gross_paise,person_paise FROM payment_schema.company_share_checkout_funding WHERE checkout_id=?", checkout);
        if (!frozenRow.isEmpty() && paymentStarted(checkout)) {
            // Collection already started on the frozen amount: keep it, whatever the switch, order-service or M10 says now.
            var r = frozenRow.getFirst();
            if (!buyer.equals(r.get("buyer_id")) || grandTotal.compareTo(BigDecimal.valueOf(number(r.get("gross_paise")), 2)) != 0) throw conflict("Frozen company share differs from the checkout");
            return BigDecimal.valueOf(number(r.get("person_paise")), 2);
        }
        if (!enabled) return null;
        JsonNode p;
        try {
            p = orders.get().uri("/payments/checkout/{id}/company-share", checkout).header("X-Craves-Internal-Secret", orderKey).retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            throw unavailable("Checkout company share could not be read");
        }
        if (p == null || !p.path("state").isTextual()) throw conflict("Checkout company share answer is invalid");
        String state = p.path("state").asText();
        if ("NONE".equals(state)) {
            if (!frozenRow.isEmpty()) throw conflict("Frozen company share is missing from order-service");
            return null;
        }
        if (!PAYABLE.contains(state)) throw conflict("Checkout company share is not payable (" + state + ")");
        if (!"INR".equals(currency)) throw conflict("Only INR company shares are supported");
        long gross = paise(p, "grossPaise"), share = paise(p, "companySharePaise"), person = paise(p, "personPaise");
        UUID charge = uuid(p, "chargeId"), company = uuid(p, "companyId");
        if (grandTotal.compareTo(BigDecimal.valueOf(gross, 2)) != 0 || gross != Math.addExact(share, person) || share <= 0) throw conflict("Company share differs from the checkout");
        if (person <= 0) throw conflict("A company share that covers the whole checkout is not supported");
        requireLiveCharge(checkout, buyer, charge, company, share);
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", rs -> null, "company-share-funding/" + checkout);
        var old = db.queryForList("SELECT buyer_id,charge_id,gross_paise,company_share_paise FROM payment_schema.company_share_checkout_funding WHERE checkout_id=?", checkout);
        if (!old.isEmpty()) {
            var r = old.getFirst();
            if (!buyer.equals(r.get("buyer_id")) || !charge.equals(r.get("charge_id")) || gross != number(r.get("gross_paise")) || share != number(r.get("company_share_paise"))) throw conflict("Frozen company share changed");
            return BigDecimal.valueOf(person, 2);
        }
        if (paymentStarted(checkout)) throw conflict("Payment collection was already started without the company share");
        var quotes = db.queryForList("SELECT response->>'total' AS total,customer_identity_id FROM payment_schema.finance_checkout_quote WHERE checkout_id=?", checkout);
        if (quotes.size() != 1 || !buyer.equals(quotes.getFirst().get("customer_identity_id")) || new BigDecimal(quotes.getFirst().get("total").toString()).compareTo(grandTotal) != 0) throw conflict("Original Finance quote is missing or changed");
        db.update("INSERT INTO payment_schema.company_share_checkout_funding(checkout_id,buyer_id,charge_id,company_id,gross_paise,company_share_paise,person_paise) VALUES (?,?,?,?,?,?,?)",
            checkout, buyer, charge, company, gross, share, person);
        return BigDecimal.valueOf(person, 2);
    }

    /** M10's own record must still hold the company's share for this checkout: RESERVED and unexpired, or CONFIRMED for it. */
    private void requireLiveCharge(UUID checkout, UUID buyer, UUID charge, UUID company, long share) {
        if (advanced == null || advancedSecret.isBlank()) throw unavailable("Company share cannot be checked (advanced service not configured)");
        JsonNode t;
        try {
            t = advanced.get().uri("/internal/v1/corporate-meals/charges/{id}/checkout-terms?personId={person}", charge, buyer)
                .header("X-Craves-Internal-Secret", advancedSecret).retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException.NotFound e) {
            throw conflict("Company share is no longer held for this checkout");
        } catch (RestClientException e) {
            throw unavailable("Company share could not be checked");
        }
        if (t == null || !charge.toString().equals(t.path("id").asText()) || !company.toString().equals(t.path("companyId").asText())
            || !t.path("companySharePaise").canConvertToLong() || t.path("companySharePaise").asLong() != share) throw conflict("Company share differs from M10");
        String status = t.path("status").asText();
        boolean noOrder = t.path("orderId").isNull() || t.path("orderId").isMissingNode();
        if ("CONFIRMED".equals(status) && checkout.toString().equals(t.path("orderId").asText())) return;
        if ("RESERVED".equals(status) && noOrder) {
            Instant expires;
            try { expires = Instant.parse(t.path("expiresAt").asText()); } catch (RuntimeException e) { throw conflict("Company share answer is invalid"); }
            if (expires.isAfter(clock.instant())) return;
        }
        throw conflict("Company share reservation has lapsed; please check out again");
    }

    public boolean exists(UUID checkout) {
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.company_share_checkout_funding WHERE checkout_id=?)", Boolean.class, checkout));
    }

    private boolean paymentStarted(UUID checkout) {
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.payment_order WHERE checkout_id=?)", Boolean.class, checkout));
    }

    private static long paise(JsonNode p, String field) {
        if (!p.path(field).isTextual() || !p.path(field).asText().matches("0|[1-9][0-9]{0,12}")) throw conflict("Exact company share paise required");
        return Long.parseLong(p.path(field).asText());
    }

    private static UUID uuid(JsonNode p, String field) {
        try { return UUID.fromString(p.path(field).asText()); } catch (IllegalArgumentException e) { throw conflict("Company share identity required"); }
    }

    private static long number(Object value) { return ((Number) value).longValue(); }

    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }

    private static ResponseStatusException unavailable(String message) { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, message); }
}
