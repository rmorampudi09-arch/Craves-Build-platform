package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.AdvancedSettings;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class HttpOrderCartGateway implements OrderCartGateway {
    private final GatewayHttp http;

    public HttpOrderCartGateway(ObjectMapper json, AdvancedSettings settings) {
        this.http = new GatewayHttp(json, settings.apiOrigin(), "CART_UNAVAILABLE");
    }

    @Override
    public int itemCount(String bearerToken) {
        GatewayHttp.Reply reply = http.send("GET", "/api/v1/cart", bearerToken, null);
        if (reply.status() == 404) return 0;
        if (reply.status() != 200 || reply.body() == null) throw failure(reply);
        JsonNode items = reply.body().path("items");
        return items.isArray() ? items.size() : 0;
    }

    @Override
    public void clear(String bearerToken) {
        GatewayHttp.Reply reply = http.send("DELETE", "/api/v1/cart", bearerToken, null);
        if (reply.status() != 200 && reply.status() != 204 && reply.status() != 404) throw failure(reply);
    }

    @Override
    public void add(String bearerToken, UUID menuItemId, int quantity) {
        GatewayHttp.Reply reply = http.send("POST", "/api/v1/cart/items", bearerToken, Map.of("menuItemId", menuItemId, "quantity", quantity));
        if (reply.status() != 200 && reply.status() != 201) throw failure(reply);
    }

    private ApiProblem failure(GatewayHttp.Reply reply) {
        String code = reply.body() != null && reply.body().hasNonNull("code") ? reply.body().get("code").asText() : "HTTP_" + reply.status();
        if (reply.status() >= 400 && reply.status() < 500) {
            return new ApiProblem(409, "CART_REJECTED", "Your cart did not accept the group order (" + code + ")");
        }
        return ApiProblem.unavailable("CART_UNAVAILABLE", "Your cart could not be updated right now; retry shortly");
    }
}
