package in.craves.integration.fleet.client;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.fleet.FleetProperties;
import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Road distance for the drop leg (PLAN F6) from user-chef-service POST /internal/v1/maps/road-distance, which calls
 * Ola and caches per kitchen and address. Never fails: when user-chef is not configured or does not answer, the drop
 * is straight line × 1.3, the same fallback user-chef uses. Not retried: a slow answer is replaced by the fallback.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class RoadDistanceClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(RoadDistanceClient.class);
    static final double FALLBACK_FACTOR = 1.3;

    private final RestClient client;
    private final String secret;

    @Autowired
    public RoadDistanceClient(FleetProperties properties, @Value("${craves.fleet.services.user-chef-base-url:}") String baseUrl,
                              RestClient.Builder builder) {
        this.secret = properties.internalServiceKey();
        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(secret)) {
            this.client = null;
            return;
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(5)); // user-chef gives Ola 3 s, then answers with its own fallback
        this.client = builder.clone().baseUrl(baseUrl).requestFactory(factory).build();
    }

    RoadDistanceClient(RestClient client, String secret) {
        this.client = client;
        this.secret = secret;
    }

    /** Road metres from the kitchen to the customer. */
    public int meters(double fromLat, double fromLng, double toLat, double toLng) {
        if (client != null) {
            try {
                JsonNode reply = client.post().uri("/internal/v1/maps/road-distance")
                    .header("X-Craves-Internal-Secret", secret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("from", Map.of("lat", fromLat, "lng", fromLng), "to", Map.of("lat", toLat, "lng", toLng)))
                    .retrieve().body(JsonNode.class);
                if (reply != null && reply.path("meters").canConvertToInt() && reply.path("meters").asInt() >= 0) {
                    return reply.path("meters").asInt();
                }
            } catch (RestClientException exception) {
                LOGGER.warn("FLEET_ROAD_DISTANCE_FALLBACK reason={}", exception.getClass().getSimpleName());
            }
        }
        return (int) Math.round(straightLineMetres(fromLat, fromLng, toLat, toLng) * FALLBACK_FACTOR);
    }

    /** Haversine metres. */
    public static double straightLineMetres(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.pow(Math.sin(dLat / 2), 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
    }
}
