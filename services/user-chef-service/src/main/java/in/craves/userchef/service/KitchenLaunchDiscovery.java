package in.craves.userchef.service;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.userchef.config.KitchenLaunchAlertProperties;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

/**
 * Asks catalog the same question customer Home asks ("Kitchens near you"), so a launch alert only fires for a
 * kitchen the customer can actually order from: active, payouts approved and at least one dish available.
 */
@Component
public class KitchenLaunchDiscovery {
    public record NearbyKitchen(UUID id, String name) {
    }

    private final KitchenLaunchAlertProperties properties;
    private final RestClient.Builder restClientBuilder;

    public KitchenLaunchDiscovery(KitchenLaunchAlertProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClientBuilder = restClientBuilder;
    }

    public Optional<NearbyKitchen> firstKitchen(BigDecimal latitude, BigDecimal longitude) {
        if (!StringUtils.hasText(properties.getDiscoveryBaseUrl())) {
            throw new IllegalStateException("CRAVES_DISCOVERY_BASE_URL is not set");
        }
        JsonNode body = restClientBuilder.clone()
            .baseUrl(properties.getDiscoveryBaseUrl())
            .build()
            .get()
            .uri(uri -> uri.path("/api/v1/discovery/kitchens")
                .queryParam("latitude", latitude.toPlainString())
                .queryParam("longitude", longitude.toPlainString())
                .queryParam("radiusMeters", properties.getRadiusMeters())
                .queryParam("page", 0)
                .queryParam("size", 1)
                .build())
            .accept(MediaType.APPLICATION_JSON)
            .retrieve()
            .body(JsonNode.class);
        JsonNode first = body == null ? null : body.path("kitchens").path(0);
        if (first == null || !first.hasNonNull("id")) {
            return Optional.empty();
        }
        String name = text(first, "displayName");
        if (name == null) {
            name = text(first, "kitchenName");
        }
        return Optional.of(new NearbyKitchen(UUID.fromString(first.get("id").asText()), name == null ? "A home kitchen" : name));
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText("").trim();
        return value.isEmpty() ? null : value;
    }
}
