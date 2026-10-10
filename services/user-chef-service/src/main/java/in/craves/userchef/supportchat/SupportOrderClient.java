package in.craves.userchef.supportchat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.userchef.exception.ApiException;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Reads the caller's own orders from order-service with the caller's bearer token, so order-service keeps
 * enforcing ownership. Responses are reduced to an allowlist of fields the caller already sees in the app:
 * no identity ids, addresses, phone numbers, kitchen pickup details or chef notes ever reach the model.
 */
@Component
public class SupportOrderClient {
    private static final Logger log = LoggerFactory.getLogger(SupportOrderClient.class);
    private static final int MAX_RESPONSE_BYTES = 1024 * 1024;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI base;
    private final Duration timeout;

    @Autowired
    public SupportOrderClient(ObjectMapper objectMapper) {
        this(
            objectMapper,
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build(),
            httpsBase(System.getenv("CRAVES_SUPPORT_ORDER_BASE_URL")),
            Duration.ofSeconds(6)
        );
    }

    SupportOrderClient(ObjectMapper objectMapper, HttpClient httpClient, URI base, Duration timeout) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.base = base;
        this.timeout = timeout;
    }

    /** The caller's 10 latest orders, newest first. */
    public ArrayNode recentOrders(String bearer, boolean chef) {
        JsonNode page = get(bearer, (chef ? "/api/v1/chef/orders/page" : "/api/v1/orders/page") + "?limit=10");
        ArrayNode orders = objectMapper.createArrayNode();
        if (page != null) {
            page.path("orders").forEach(order -> orders.add(summary(order)));
        }
        return orders;
    }

    /** One of the caller's orders, or null when it does not exist or is not theirs. */
    public ObjectNode order(String bearer, boolean chef, UUID orderId) {
        JsonNode order = get(bearer, (chef ? "/api/v1/chef/orders/" : "/api/v1/orders/") + orderId);
        if (order == null || !order.isObject()) {
            return null;
        }
        ObjectNode detail = summary(order);
        copy(detail, order, "foodSubtotal", "foodSubtotal");
        copy(detail, order, "platformFee", "platformFee");
        copy(detail, order, "taxAmount", "taxAmount");
        copy(detail, order, "deliveryFee", "deliveryFee");
        copy(detail, order, "prepTimeMinutes", "prepTimeMinutes");
        copy(detail, order, "updatedAt", "updatedAt");
        ArrayNode items = detail.putArray("items");
        order.path("items").forEach(item -> {
            ObjectNode line = items.addObject();
            copy(line, item, "itemName", "name");
            copy(line, item, "quantity", "quantity");
            copy(line, item, "lineTotal", "lineTotal");
        });
        if (!chef) {
            JsonNode delivery;
            try {
                delivery = get(bearer, "/api/v1/orders/" + orderId + "/delivery-status");
            } catch (ApiException exception) {
                delivery = null; // The order itself is still useful without live delivery status.
            }
            if (delivery != null && delivery.isObject()) {
                ObjectNode status = detail.putObject("delivery");
                copy(status, delivery, "status", "status");
                copy(status, delivery, "observedAt", "updatedAt");
                String trackingUrl = delivery.path("trackingUrl").asText("");
                if (trackingUrl.startsWith("https://")) {
                    status.put("trackingUrl", trackingUrl);
                }
            }
        }
        return detail;
    }

    private ObjectNode summary(JsonNode order) {
        ObjectNode summary = objectMapper.createObjectNode();
        copy(summary, order, "id", "orderId");
        copy(summary, order, "kitchenName", "kitchenName");
        copy(summary, order, "status", "status");
        copy(summary, order, "grandTotal", "grandTotal");
        copy(summary, order, "currency", "currency");
        copy(summary, order, "createdAt", "placedAt");
        return summary;
    }

    /** Copies scalars only, so an allowlisted name can never carry a nested object through. */
    private static void copy(ObjectNode target, JsonNode source, String from, String to) {
        JsonNode value = source.get(from);
        if (value != null && value.isValueNode() && !value.isNull()) {
            target.set(to, value);
        }
    }

    /** Null for 403/404 (not the caller's); 503 for anything else so the assistant can say lookups are down. */
    private JsonNode get(String bearer, String path) {
        if (base == null) {
            throw unavailable("CRAVES_SUPPORT_ORDER_BASE_URL is not configured");
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(base + path))
            .timeout(timeout)
            .header("Accept", "application/json")
            .header("Authorization", bearer)
            .GET()
            .build();
        CompletableFuture<HttpResponse<byte[]>> pending =
            httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray());
        HttpResponse<byte[]> response;
        try {
            response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            pending.cancel(true);
            throw unavailable("timeout");
        } catch (ExecutionException exception) {
            throw unavailable("network error");
        } catch (InterruptedException exception) {
            pending.cancel(true);
            Thread.currentThread().interrupt();
            throw unavailable("interrupted");
        }
        int status = response.statusCode();
        if (status == 403 || status == 404) {
            return null;
        }
        byte[] body = response.body();
        if (status < 200 || status >= 300 || body == null || body.length > MAX_RESPONSE_BYTES) {
            throw unavailable("HTTP " + status);
        }
        try {
            return objectMapper.readTree(body);
        } catch (IOException exception) {
            throw unavailable("invalid JSON response");
        }
    }

    private static URI httpsBase(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim().replaceAll("/+$", "");
        if (!trimmed.startsWith("https://")) {
            log.warn("Ignoring CRAVES_SUPPORT_ORDER_BASE_URL: it must be an https origin");
            return null;
        }
        return URI.create(trimmed);
    }

    private static ApiException unavailable(String reason) {
        log.warn("Support chat order lookup unavailable: {}", reason);
        return new ApiException(503, "ORDER_LOOKUP_UNAVAILABLE", "Order lookup is unavailable right now.");
    }
}
