package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.data.Money;
import in.craves.advanced.platform.web.ApiProblem;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class HttpMenuSearchGateway implements MenuSearchGateway {
    private final GatewayHttp http;

    public HttpMenuSearchGateway(ObjectMapper json, AdvancedSettings settings) {
        this.http = new GatewayHttp(json, settings.apiOrigin(), "CATALOG_UNAVAILABLE");
    }

    @Override
    public List<FoundDish> nearbyDishes(MenuSearch search) {
        StringBuilder path = new StringBuilder("/api/v1/discovery/menu-items?latitude=").append(search.latitude().toPlainString())
                .append("&longitude=").append(search.longitude().toPlainString()).append("&radiusMeters=").append(search.radiusMeters())
                .append("&size=").append(search.size());
        param(path, "query", search.text());
        param(path, "foodType", search.foodType());
        param(path, "spiceLevel", search.spiceLevel());
        param(path, "category", search.category());
        GatewayHttp.Reply reply = http.send("GET", path.toString(), null, null);
        if (reply.status() == 400) {
            String code = reply.body() != null && reply.body().path("code").isTextual() ? reply.body().get("code").asText() : "INVALID_SEARCH";
            throw ApiProblem.badRequest(code, "Catalog refused this search");
        }
        if (reply.status() != 200 || reply.body() == null) throw http.unavailable();
        return dishes(reply.body());
    }

    private static void param(StringBuilder path, String name, String value) {
        if (value != null) path.append('&').append(name).append('=').append(URLEncoder.encode(value, StandardCharsets.UTF_8));
    }

    /** Catalog's NearbyMenuItemDiscoveryResponse; an entry without an id is skipped. */
    static List<FoundDish> dishes(JsonNode body) {
        List<FoundDish> out = new ArrayList<>();
        for (JsonNode node : body.path("menuItems")) {
            try {
                UUID kitchen = node.hasNonNull("kitchenId") ? UUID.fromString(node.get("kitchenId").asText()) : null;
                String kitchenName = text(node, "kitchenDisplayName") != null ? text(node, "kitchenDisplayName") : text(node, "kitchenName");
                Long paise = node.hasNonNull("price") ? Money.paise(new BigDecimal(node.get("price").asText())) : null;
                out.add(new FoundDish(UUID.fromString(node.get("id").asText()), kitchen, kitchenName, text(node, "itemName"),
                        text(node, "description"), text(node, "category"), text(node, "foodType"), text(node, "spiceLevel"), paise,
                        node.path("distanceMeters").asLong(0), text(node, "primaryImageUrl")));
            } catch (RuntimeException skipped) {
                // shortcut: a malformed entry is dropped; log it if search results ever go missing unexplained.
            }
        }
        return List.copyOf(out);
    }

    private static String text(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asText() : null;
    }
}
