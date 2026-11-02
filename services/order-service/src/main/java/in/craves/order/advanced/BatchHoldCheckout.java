package in.craves.order.advanced;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * M24b: confirms the customer's M07 small-batch holds with the chef order each dish landed in, inside the checkout
 * transaction, so a hold that cannot be confirmed rolls the checkout back. Calls the advanced service with the caller's own token.
 */
@Service
@ConditionalOnProperty(name = "CRAVES_ADVANCED_CHECKOUT_BATCH_HOLDS_ENABLED", havingValue = "true")
public class BatchHoldCheckout {
    static final int MAX_HOLDS = 3; // each confirm is an HTTP call inside the checkout transaction
    private final RestClient advanced;

    @Autowired
    public BatchHoldCheckout(RestClient.Builder builder, @Value("${CRAVES_ADVANCED_BASE_URL:https://api.craves.in}") String baseUrl) {
        this(builder.clone().baseUrl(baseUrl).requestFactory(timeouts()).build());
    }

    BatchHoldCheckout(RestClient advanced) {
        this.advanced = advanced;
    }

    private static JdkClientHttpRequestFactory timeouts() {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(2));
        return factory;
    }

    /** Request shape: [{"holdId": uuid, "menuItemId": uuid}], one hold per dish. Each hold must be for that dish and no bigger than its ordered quantity. */
    public static Map<UUID, UUID> parse(JsonNode request) {
        if (!request.isArray() || request.isEmpty() || request.size() > MAX_HOLDS) {
            throw OrderApiException.badRequest("INVALID_BATCH_HOLDS", "batchHolds must list 1 to " + MAX_HOLDS + " holds");
        }
        Map<UUID, UUID> holdByDish = new LinkedHashMap<>();
        var holds = new HashSet<UUID>();
        for (JsonNode entry : request) {
            UUID hold = uuid(entry, "holdId"), dish = uuid(entry, "menuItemId");
            if (entry.size() != 2 || !holds.add(hold) || holdByDish.put(dish, hold) != null) {
                throw OrderApiException.badRequest("INVALID_BATCH_HOLDS", "Each batch hold names one holdId and one menuItemId, once each");
            }
        }
        return holdByDish;
    }

    public void confirm(CheckoutResponse checkout, Map<UUID, UUID> holdByDish, String authorization) {
        if (authorization == null || authorization.isBlank()) {
            throw OrderApiException.conflict("BATCH_HOLD_UNCONFIRMED", "Batch holds need the customer's own sign-in");
        }
        Map<UUID, UUID> orderByDish = new HashMap<>();
        Map<UUID, Integer> quantityByDish = new HashMap<>();
        for (var order : checkout.orders()) {
            for (var item : order.items()) {
                orderByDish.put(item.menuItemId(), order.id()); // a dish belongs to one kitchen, so to one chef order
                quantityByDish.merge(item.menuItemId(), item.quantity(), Integer::sum);
            }
        }
        for (var held : holdByDish.entrySet()) {
            if (!orderByDish.containsKey(held.getKey())) {
                throw OrderApiException.conflict("BATCH_HOLD_DISH_NOT_IN_CART", "A batch hold names a dish this checkout does not contain");
            }
        }
        // shortcut: if a later hold fails, earlier ones stay confirmed for an order that rolled back; the chef voids them (M07). Upgrade with an M07 unconfirm call if it happens in practice.
        for (var held : holdByDish.entrySet()) {
            var body = Map.of("orderId", orderByDish.get(held.getKey()), "menuItemId", held.getKey(), "maxPortions", quantityByDish.get(held.getKey()));
            try {
                advanced.post().uri("/api/v1/advanced/kitchen-capacity/holds/{holdId}/confirm", held.getValue())
                    .header(HttpHeaders.AUTHORIZATION, authorization).contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().toBodilessEntity();
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403 || e.getStatusCode().value() == 429) {
                    throw unavailable();
                }
                String code;
                try {
                    code = e.getResponseBodyAs(JsonNode.class) instanceof JsonNode problem ? problem.path("code").asText("") : "";
                } catch (RuntimeException notJson) {
                    code = ""; // e.g. a gateway HTML page
                }
                throw OrderApiException.conflict("BATCH_HOLD_" + (code.matches("[A-Z_]{1,40}") ? code : "REFUSED"),
                    "A batch hold could not be confirmed; hold the portions again");
            } catch (RestClientException e) {
                throw unavailable();
            }
        }
    }

    private static OrderApiException unavailable() {
        return OrderApiException.serviceUnavailable("BATCH_HOLDS_UNAVAILABLE", "Batch holds cannot be confirmed right now. Please try again.");
    }

    private static UUID uuid(JsonNode entry, String field) {
        try {
            if (entry.path(field).isTextual()) return UUID.fromString(entry.path(field).asText());
        } catch (IllegalArgumentException ignored) {
            // fall through
        }
        throw OrderApiException.badRequest("INVALID_BATCH_HOLDS", field + " must be a UUID");
    }
}
