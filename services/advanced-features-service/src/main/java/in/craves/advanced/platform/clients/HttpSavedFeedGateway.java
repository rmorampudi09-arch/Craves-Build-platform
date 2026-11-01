package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.data.Money;
import in.craves.advanced.platform.web.ApiProblem;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.stereotype.Component;

@Component
public class HttpSavedFeedGateway implements SavedFeedGateway {
    private final GatewayHttp favorites;
    private final GatewayHttp catalog;
    private final GatewayHttp orders;

    public HttpSavedFeedGateway(ObjectMapper json, AdvancedSettings settings) {
        this.favorites = new GatewayHttp(json, settings.apiOrigin(), "FAVORITES_UNAVAILABLE");
        this.catalog = new GatewayHttp(json, settings.apiOrigin(), "CATALOG_UNAVAILABLE");
        this.orders = new GatewayHttp(json, settings.apiOrigin(), "ORDERS_UNAVAILABLE");
    }

    @Override
    public List<SavedItem> favoriteDishes(String token) {
        JsonNode body = customerRead(favorites, "/api/v1/customer/favorites", token);
        return parse(body.isArray() ? body : body.path("items"), node -> new SavedItem(uuid(node, "menuItemId"), instant(node, "createdAt")));
    }

    @Override
    public List<SavedItem> favoriteKitchens(String token) {
        JsonNode body = customerRead(favorites, "/api/v1/customer/favorite-kitchens?limit=100", token);
        return parse(body.path("items"), node -> new SavedItem(uuid(node, "kitchenId"), instant(node, "createdAt")));
    }

    @Override
    public Map<UUID, KitchenState> kitchenStates(Collection<UUID> kitchenIds) {
        Map<UUID, KitchenState> found = new LinkedHashMap<>();
        if (kitchenIds.isEmpty()) return found;
        GatewayHttp.Reply reply = catalog.send("POST", "/api/v1/discovery/favorites/home/resolve", null,
                Map.of("kitchenIds", List.copyOf(kitchenIds), "chefIdentityIds", List.of()));
        if (reply.status() != 200 || reply.body() == null) throw catalog.unavailable();
        for (KitchenState state : kitchens(reply.body())) found.put(state.kitchenId(), state);
        return found;
    }

    @Override
    public History deliveredOrders(String token) {
        return history(customerRead(orders, "/api/v1/orders/repeat-candidates?limit=50", token));
    }

    /** Catalog's ResolveFavoriteHomeResponse: one card per requested kitchen. */
    static List<KitchenState> kitchens(JsonNode body) {
        return parse(body.path("items"), node -> new KitchenState(uuid(node, "requestedId"), node.path("exists").asBoolean(false),
                text(node, "kitchenName"), text(node, "cookingState"), instant(node, "nextAvailabilityAt"),
                node.path("acceptingOrders").asBoolean(false), node.path("activeAvailableDishCount").asInt(0),
                parse(node.path("menuPreview"), dish -> new PreviewDish(uuid(dish, "menuItemId"), text(dish, "itemName"), paise(dish.get("price"))))));
    }

    /** Order service's RepeatOrderPage. */
    static History history(JsonNode body) {
        List<PastOrder> list = parse(body.path("items"), node -> new PastOrder(uuid(node, "orderId"), uuid(node, "kitchenId"),
                text(node, "kitchenName"), instant(node, "lastOrderedAt"), node.path("completedOrdersFromKitchen").asInt(0),
                parse(node.path("items"), item -> new PastOrderItem(uuid(item, "menuItemId"), text(item, "itemName"), item.path("quantity").asInt(0)))));
        return new History(list, !body.path("hasMore").asBoolean(false));
    }

    private static JsonNode customerRead(GatewayHttp http, String path, String token) {
        GatewayHttp.Reply reply = http.send("GET", path, token, null);
        if (reply.status() == 401) throw new ApiProblem(401, "AUTHENTICATION_REQUIRED", "Sign in again to continue");
        if (reply.status() == 403) throw ApiProblem.forbidden("ACCESS_DENIED", "Sign in with a customer account");
        if (reply.status() != 200 || reply.body() == null) throw http.unavailable();
        return reply.body();
    }

    /** Entries that do not parse (a missing id) are skipped rather than failing the whole feed. */
    private static <T> List<T> parse(JsonNode array, Function<JsonNode, T> read) {
        List<T> out = new ArrayList<>();
        if (array == null || !array.isArray()) return out;
        for (JsonNode node : array) {
            try {
                out.add(read.apply(node));
            } catch (RuntimeException skipped) {
                // shortcut: a malformed entry is dropped silently; log it if Saved cards ever go missing unexplained.
            }
        }
        return List.copyOf(out);
    }

    private static UUID uuid(JsonNode node, String field) {
        return UUID.fromString(node.get(field).asText());
    }

    private static String text(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asText() : null;
    }

    private static Instant instant(JsonNode node, String field) {
        try {
            return node.hasNonNull(field) ? Instant.parse(node.get(field).asText()) : null;
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private static Long paise(JsonNode price) {
        try {
            return price == null || price.isNull() ? null : Money.paise(new BigDecimal(price.asText()));
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
