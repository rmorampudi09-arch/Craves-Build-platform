package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.data.Money;
import in.craves.advanced.platform.web.ApiProblem;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class HttpCatalogGateway implements CatalogGateway {
    private final GatewayHttp http;

    public HttpCatalogGateway(ObjectMapper json, AdvancedSettings settings) {
        this.http = new GatewayHttp(json, settings.apiOrigin(), "CATALOG_UNAVAILABLE");
    }

    @Override
    public Map<UUID, MenuItem> purchasable(Collection<UUID> menuItemIds) {
        List<UUID> ids = menuItemIds.stream().distinct().toList();
        Map<UUID, MenuItem> found = new LinkedHashMap<>();
        for (int from = 0; from < ids.size(); from += 100) {
            List<UUID> batch = new ArrayList<>(ids.subList(from, Math.min(ids.size(), from + 100)));
            GatewayHttp.Reply reply = http.send("POST", "/api/v1/catalog/menu-items/resolve", null, Map.of("menuItemIds", batch));
            if (reply.status() != 200 || reply.body() == null || !reply.body().isArray()) throw http.unavailable();
            for (JsonNode node : reply.body()) {
                MenuItem item = item(node);
                if (item != null) found.put(item.id(), item);
            }
        }
        return found;
    }

    @Override
    public Optional<MenuItem> menuItem(UUID menuItemId) {
        GatewayHttp.Reply reply = http.send("GET", "/api/v1/catalog/menu-items/" + menuItemId, null, null);
        if (reply.status() == 404 || reply.status() == 400) return Optional.empty();
        if (reply.status() != 200 || reply.body() == null) throw http.unavailable();
        return Optional.ofNullable(item(reply.body()));
    }

    @Override
    public boolean kitchenExists(UUID kitchenId) {
        GatewayHttp.Reply reply = http.send("GET", "/api/v1/catalog/kitchens/" + kitchenId, null, null);
        if (reply.status() == 404 || reply.status() == 400) return false;
        if (reply.status() != 200) throw http.unavailable();
        return true;
    }

    @Override
    public Map<UUID, MenuItem> chefMenuItems(String chefBearerToken) {
        GatewayHttp.Reply reply = http.send("GET", "/api/v1/kitchens/me/menu-items", chefBearerToken, null);
        if (reply.status() == 401 || reply.status() == 403 || reply.status() == 404) {
            throw ApiProblem.forbidden("CHEF_KITCHEN_REQUIRED", "An approved chef kitchen is required");
        }
        if (reply.status() != 200 || reply.body() == null) throw http.unavailable();
        JsonNode list = reply.body().isArray() ? reply.body()
                : reply.body().has("items") ? reply.body().get("items") : reply.body().get("content");
        Map<UUID, MenuItem> items = new LinkedHashMap<>();
        if (list != null && list.isArray()) {
            for (JsonNode node : list) {
                MenuItem item = item(node);
                if (item != null) items.put(item.id(), item);
            }
        }
        return items;
    }

    static MenuItem item(JsonNode node) {
        try {
            UUID id = UUID.fromString(node.path("id").asText());
            UUID kitchen = node.hasNonNull("kitchenId") ? UUID.fromString(node.get("kitchenId").asText()) : null;
            String name = node.hasNonNull("itemName") ? node.get("itemName").asText() : node.path("name").asText(null);
            Long price = node.hasNonNull("price") ? Money.paise(new BigDecimal(node.get("price").asText())) : null;
            return new MenuItem(id, kitchen, name, price);
        } catch (RuntimeException ex) {
            return null;
        }
    }
}
