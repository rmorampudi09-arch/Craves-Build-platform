package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.data.Money;
import in.craves.advanced.platform.web.ApiProblem;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

@Component
public class HttpOrderGateway implements OrderGateway {
    private final GatewayHttp http;

    public HttpOrderGateway(ObjectMapper json, AdvancedSettings settings) {
        this.http = new GatewayHttp(json, settings.apiOrigin(), "ORDERS_UNAVAILABLE");
    }

    @Override
    public Optional<Order> customerOrder(String customerBearerToken, UUID orderId) {
        return read(http.send("GET", "/api/v1/orders/" + orderId, customerBearerToken, null), http::unavailable);
    }

    @Override
    public Optional<Order> chefOrder(String chefBearerToken, UUID orderId) {
        return read(http.send("GET", "/api/v1/chef/orders/" + orderId, chefBearerToken, null), http::unavailable);
    }

    @Override
    public OrderPage chefOrderPage(String chefBearerToken, String cursor) {
        String query = "?limit=100" + (cursor == null ? "" : "&cursor=" + URLEncoder.encode(cursor, StandardCharsets.UTF_8));
        GatewayHttp.Reply reply = http.send("GET", "/api/v1/chef/orders/page" + query, chefBearerToken, null);
        if (reply.status() == 401) throw new ApiProblem(401, "AUTHENTICATION_REQUIRED", "Sign in again to continue");
        if (reply.status() == 403) throw ApiProblem.forbidden("ACCESS_DENIED", "Sign in with a chef account");
        if (reply.status() != 200 || reply.body() == null) throw http.unavailable();
        try {
            return page(reply.body());
        } catch (RuntimeException unreadable) {
            throw http.unavailable();
        }
    }

    /** Order service's OrderPageResponse; a missing cursor or hasMore=false ends the paging. */
    static OrderPage page(JsonNode body) {
        List<Order> orders = new ArrayList<>();
        for (JsonNode node : body.path("orders")) orders.add(order(node));
        JsonNode next = body.path("nextCursor");
        return new OrderPage(List.copyOf(orders), body.path("hasMore").asBoolean(false) && next.isTextual() ? next.asText() : null);
    }

    /**
     * Not found and not the caller's (Order service answers 404 to customers and 403 to other kitchens' chefs) both read as
     * "no such order", so order ids reveal nothing. A token Order service refuses (expired, revoked) stays a 401.
     */
    static Optional<Order> read(GatewayHttp.Reply reply, Supplier<ApiProblem> unavailable) {
        int status = reply.status();
        if (status == 401) throw new ApiProblem(401, "AUTHENTICATION_REQUIRED", "Sign in again to continue");
        if (status == 400 || status == 403 || status == 404) return Optional.empty();
        if (status != 200 || reply.body() == null) throw unavailable.get();
        try {
            return Optional.of(order(reply.body()));
        } catch (RuntimeException unreadable) {
            throw unavailable.get();
        }
    }

    /** Order service's OrderResponse: money in rupees with two decimals, converted to paise here. */
    static Order order(JsonNode node) {
        List<OrderLine> lines = new ArrayList<>();
        for (JsonNode item : node.path("items")) {
            UUID menuItemId = item.hasNonNull("menuItemId") ? UUID.fromString(item.get("menuItemId").asText()) : null;
            lines.add(new OrderLine(UUID.fromString(item.path("id").asText()), menuItemId, item.path("itemName").asText(null),
                    Money.paise(new BigDecimal(item.path("unitPrice").asText())), item.path("quantity").asInt()));
        }
        return new Order(UUID.fromString(node.path("id").asText()), UUID.fromString(node.path("customerIdentityId").asText()),
                UUID.fromString(node.path("kitchenId").asText()), node.path("status").asText(), List.copyOf(lines), optionalPaise(node, "grandTotal"),
                optionalInstant(node, "createdAt"), optionalInstant(node, "updatedAt"));
    }

    /** Optional fields read leniently (null when missing or in another form), so a format change never fails every order read. */
    private static Long optionalPaise(JsonNode node, String field) {
        try {
            return node.hasNonNull(field) ? Money.paise(new BigDecimal(node.get(field).asText())) : null;
        } catch (RuntimeException unexpected) {
            return null;
        }
    }

    private static Instant optionalInstant(JsonNode node, String field) {
        try {
            return node.hasNonNull(field) ? Instant.parse(node.get(field).asText()) : null;
        } catch (RuntimeException unexpected) {
            return null;
        }
    }
}
