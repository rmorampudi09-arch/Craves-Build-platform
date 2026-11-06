package in.craves.order.advanced;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * M24c slice B: a checkout may carry {@code menuOptions: {"<menuItemId>": ["<choiceId>", ...]}} (one option set per dish). Inside the
 * checkout transaction and before Finance binds it, order-service asks M05 (internal secret) to price those dishes at the checkout's own
 * time, checks each base is the price the order was made at, raises the order lines and totals to base + options and freezes the quote
 * in {@code menu_option_checkout_line}. Finance then prices the raised lines (commission and GST on add-ons exactly as on the dish).
 * Any refusal rolls the checkout back and keeps the cart; nothing is ever priced in part.
 */
@Service
@ConditionalOnProperty(name = "CRAVES_ADVANCED_CHECKOUT_OPTIONS_ENABLED", havingValue = "true")
public class MenuOptionCheckout {
    static final int MAX_DISHES = 50, MAX_CHOICES = 50;
    private final RestClient internalApi;
    private final String secret;
    private final JdbcTemplate db;
    private final ObjectMapper json;

    @Autowired
    public MenuOptionCheckout(RestClient.Builder builder, JdbcTemplate db, ObjectMapper json,
                              @Value("${CRAVES_ADVANCED_INTERNAL_BASE_URL:}") String internalBaseUrl,
                              @Value("${CRAVES_ADVANCED_INTERNAL_SECRET:}") String secret) {
        this(internalBaseUrl.isBlank() ? null : builder.clone().baseUrl(internalBaseUrl).requestFactory(timeouts()).build(), secret, db, json);
    }

    MenuOptionCheckout(RestClient internalApi, String secret, JdbcTemplate db, ObjectMapper json) {
        this.internalApi = internalApi;
        this.secret = secret == null ? "" : secret;
        this.db = db;
        this.json = json;
    }

    private static JdkClientHttpRequestFactory timeouts() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(2));
        return factory;
    }

    /** Request shape: an object of 1-50 dish ids, each with 0-50 distinct choice ids. Returned sorted, so it hashes the same however sent. */
    public static Map<UUID, Set<UUID>> parse(JsonNode request) {
        if (request == null || !request.isObject() || request.isEmpty() || request.size() > MAX_DISHES) {
            throw invalid("menuOptions must name 1 to " + MAX_DISHES + " dishes");
        }
        Map<UUID, Set<UUID>> picks = new TreeMap<>();
        for (var field : (Iterable<Map.Entry<String, JsonNode>>) request::fields) {
            JsonNode choices = field.getValue();
            if (!choices.isArray() || choices.size() > MAX_CHOICES) throw invalid("Each dish takes a list of up to " + MAX_CHOICES + " choices");
            Set<UUID> ids = new TreeSet<>();
            for (JsonNode choice : choices) {
                if (!choice.isTextual() || !ids.add(uuid(choice.asText()))) throw invalid("Choices must be distinct ids");
            }
            if (picks.put(uuid(field.getKey()), ids) != null) throw invalid("Each dish may appear once");
        }
        return picks;
    }

    /** Canonical text for idempotency fingerprints. */
    public static String canonical(JsonNode request) {
        return parse(request).toString();
    }

    /** Runs inside the checkout transaction, before Finance binds it. Returns nothing: the caller re-reads the checkout. */
    public void apply(CheckoutResponse checkout, Map<UUID, Set<UUID>> picks) {
        if (internalApi == null || secret.isBlank()) throw unavailable();
        Map<UUID, Line> lines = new LinkedHashMap<>();
        for (var order : checkout.orders()) {
            for (var item : order.items()) {
                if (picks.containsKey(item.menuItemId()) && lines.put(item.menuItemId(), new Line(order.id(), item.id(), item.quantity(), paise(item.unitPrice()))) != null) {
                    throw OrderApiException.conflict("MENU_OPTIONS_DUPLICATE_DISH", "A dish with options can be in the order only once");
                }
            }
        }
        if (!lines.keySet().equals(picks.keySet())) {
            throw OrderApiException.badRequest("MENU_OPTIONS_UNKNOWN_DISH", "Options were sent for a dish that is not in the cart");
        }
        ObjectNode body = json.createObjectNode().put("at", checkout.createdAt().toString());
        var requested = body.putArray("lines");
        lines.forEach((dish, line) -> {
            var row = requested.addObject().put("menuItemId", dish.toString()).put("quantity", line.quantity);
            var ids = row.putArray("choiceIds");
            picks.get(dish).forEach(id -> ids.add(id.toString()));
        });
        JsonNode quote;
        try {
            quote = internalApi.post().uri("/internal/v1/menu-options/checkout-quote").header("X-Craves-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException e) {
            int status = e.getStatusCode().value();
            if (status == 401 || status == 403 || status == 404 || status == 429) throw unavailable();
            String code = code(e);
            throw OrderApiException.conflict(code.isEmpty() ? "MENU_OPTIONS_REFUSED" : "MENU_OPTIONS_" + code, "These choices cannot be ordered right now");
        } catch (RestClientException e) {
            throw unavailable();
        }
        if (quote == null || !quote.path("lines").isArray() || quote.path("lines").size() != lines.size()) throw mismatch();
        Map<UUID, Long> delta = new HashMap<>();
        Set<UUID> seen = new HashSet<>();
        long sum = 0;
        for (JsonNode quoted : quote.path("lines")) {
            UUID dish = answerId(quoted.path("menuItemId"));
            Line line = lines.get(dish);
            if (line == null || !seen.add(dish) || quoted.path("quantity").asInt(-1) != line.quantity) throw mismatch();
            long base = number(quoted, "basePricePaise"), unit = number(quoted, "unitPricePaise"), total = number(quoted, "totalPaise");
            Set<UUID> chosen = new TreeSet<>();
            long options = 0;
            if (!quoted.path("choices").isArray()) throw mismatch();
            for (JsonNode choice : quoted.path("choices")) {
                if (!chosen.add(answerId(choice.path("choiceId")))) throw mismatch();
                options = Math.addExact(options, number(choice, "priceDeltaPaise"));
            }
            if (!chosen.equals(picks.get(dish)) || unit != Math.addExact(base, options) || unit <= 0 || total != Math.multiplyExact(unit, line.quantity)) throw mismatch();
            if (base != line.unitPaise) {
                throw OrderApiException.conflict("MENU_OPTIONS_PRICE_CHANGED", "Prices changed while adding your choices. Please try again.");
            }
            sum = Math.addExact(sum, total);
            delta.merge(line.order, Math.multiplyExact(unit - base, line.quantity), Math::addExact);
            if (db.update("UPDATE order_schema.order_item SET unit_price_snapshot=?, line_total=? WHERE id=? AND order_id=? AND menu_item_id=? AND quantity=?",
                money(unit), money(total), line.item, line.order, dish, line.quantity) != 1) throw mismatch();
            db.update("""
                INSERT INTO order_schema.menu_option_checkout_line(order_item_id, checkout_id, chef_order_id, menu_item_id, quantity, base_paise, unit_paise,
                  options_version, meal_period, choices, quoted_at) VALUES (?,?,?,?,?,?,?,?,?,CAST(? AS jsonb),?)""",
                line.item, checkout.id(), line.order, dish, line.quantity, base, unit, quoted.path("optionsVersion").asLong(0),
                quoted.path("mealPeriod").isTextual() ? quoted.path("mealPeriod").asText() : null, quoted.path("choices").toString(),
                java.sql.Timestamp.from(checkout.createdAt()));
        }
        if (sum != quote.path("totalPaise").asLong(-1)) throw mismatch();
        long added = 0;
        for (var entry : delta.entrySet()) {
            added = Math.addExact(added, entry.getValue());
            // Finance's bind re-prices platform fee, tax and the grand total from these food lines.
            if (db.update("UPDATE order_schema.customer_order SET food_subtotal=food_subtotal+?, grand_total=grand_total+?, updated_at=now() WHERE id=? AND checkout_id=? AND status='PAYMENT_PENDING'",
                money(entry.getValue()), money(entry.getValue()), entry.getKey(), checkout.id()) != 1) throw mismatch();
        }
        if (db.update("UPDATE order_schema.checkout SET food_subtotal=food_subtotal+?, grand_total=grand_total+?, updated_at=now() WHERE id=? AND status='PAYMENT_PENDING'",
            money(added), money(added), checkout.id()) != 1) throw mismatch();
    }

    /** The frozen option prices of a checkout, for Finance (slice C) and support. */
    public static JsonNode read(JdbcTemplate db, ObjectMapper json, UUID checkout) {
        ObjectNode result = json.createObjectNode().put("checkoutId", checkout.toString());
        var lines = result.putArray("lines");
        db.query("""
            SELECT chef_order_id, order_item_id, menu_item_id, quantity, base_paise, unit_paise, options_version, meal_period, choices::text, quoted_at
            FROM order_schema.menu_option_checkout_line WHERE checkout_id=? ORDER BY chef_order_id, menu_item_id""", rs -> {
            var line = lines.addObject().put("chefOrderId", rs.getString(1)).put("orderItemId", rs.getString(2)).put("menuItemId", rs.getString(3))
                .put("quantity", rs.getInt(4)).put("basePaise", rs.getLong(5)).put("unitPaise", rs.getLong(6)).put("optionsVersion", rs.getLong(7))
                .put("mealPeriod", rs.getString(8)).put("quotedAt", rs.getTimestamp(10).toInstant().toString());
            try {
                line.set("choices", json.readTree(rs.getString(9)));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }, checkout);
        return result;
    }

    private record Line(UUID order, UUID item, int quantity, long unitPaise) { }

    private static long number(JsonNode node, String field) {
        if (!node.path(field).canConvertToExactIntegral() || !node.path(field).canConvertToLong()) throw mismatch();
        return node.path(field).asLong();
    }

    private static BigDecimal money(long paise) {
        return BigDecimal.valueOf(paise, 2);
    }

    static long paise(BigDecimal amount) {
        return amount.movePointRight(2).longValueExact();
    }

    private static UUID uuid(String value) {
        try {
            if (value.length() != 36) throw new IllegalArgumentException();
            return UUID.fromString(value);
        } catch (RuntimeException e) {
            throw invalid("Dish and choice ids must be UUIDs");
        }
    }

    private static UUID answerId(JsonNode value) {
        try {
            return UUID.fromString(value.asText());
        } catch (RuntimeException e) {
            throw mismatch();
        }
    }

    private static String code(HttpClientErrorException e) {
        try {
            String code = e.getResponseBodyAs(JsonNode.class) instanceof JsonNode problem ? problem.path("code").asText("") : "";
            return code.matches("[A-Z_]{1,40}") ? code : "";
        } catch (RuntimeException notJson) {
            return "";
        }
    }

    private static OrderApiException invalid(String message) {
        return OrderApiException.badRequest("INVALID_MENU_OPTIONS", message);
    }

    private static OrderApiException mismatch() {
        return OrderApiException.serviceUnavailable("MENU_OPTIONS_CONTEXT_MISMATCH", "Your choices could not be priced right now. Please try again.");
    }

    private static OrderApiException unavailable() {
        return OrderApiException.serviceUnavailable("MENU_OPTIONS_UNAVAILABLE", "Choices cannot be priced right now. Please try again.");
    }
}
