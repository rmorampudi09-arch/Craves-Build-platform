package in.craves.order.pricing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.exception.OrderApiException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
public class AzureMapsRouteClient {
    private static final String AZURE_MAPS_RESOURCE = "https://atlas.microsoft.com/";
    private static final String ROUTE_API_VERSION = "2025-01-01";
    private static final String ROUTE_CACHE_PREFIX = "craves:route:2025-01-01:";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String mapsClientId;
    private final String mapsEndpoint;
    private final StringRedisTemplate redisTemplate;
    private final Duration routeCacheTtl;
    private volatile CachedToken cachedToken;

    public AzureMapsRouteClient(
        ObjectMapper objectMapper,
        ObjectProvider<StringRedisTemplate> redisTemplateProvider,
        @Value("${craves.azure-maps.client-id:}") String mapsClientId,
        @Value("${craves.azure-maps.endpoint:https://atlas.microsoft.com}") String mapsEndpoint,
        @Value("${craves.checkout-pricing.route-cache-ttl-seconds:300}") long routeCacheTtlSeconds
    ) {
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplateProvider.getIfAvailable();
        this.mapsClientId = mapsClientId == null ? "" : mapsClientId.trim();
        this.mapsEndpoint = normalizeEndpoint(mapsEndpoint);
        this.routeCacheTtl = Duration.ofSeconds(Math.max(30L, Math.min(routeCacheTtlSeconds, 1_800L)));
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    }

    public RouteResult drivingRoute(
        BigDecimal pickupLatitude,
        BigDecimal pickupLongitude,
        BigDecimal dropoffLatitude,
        BigDecimal dropoffLongitude
    ) {
        requireCoordinates(pickupLatitude, pickupLongitude);
        requireCoordinates(dropoffLatitude, dropoffLongitude);
        if (mapsClientId.isBlank()) {
            throw unavailable();
        }

        String cacheKey = routeCacheKey(
            pickupLatitude,
            pickupLongitude,
            dropoffLatitude,
            dropoffLongitude
        );
        RouteResult cached = readCachedRoute(cacheKey);
        if (cached != null) {
            return cached;
        }

        try {
            URI uri = URI.create(mapsEndpoint + "/route/directions?api-version=" + ROUTE_API_VERSION);
            String accessToken = managedIdentityToken();
            String requestBody = requestBody(
                pickupLatitude,
                pickupLongitude,
                dropoffLatitude,
                dropoffLongitude
            );

            HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(8))
                .header("Authorization", "Bearer " + accessToken)
                .header("x-ms-client-id", mapsClientId)
                .header("Accept-Language", "en-IN")
                .header("Accept", "application/geo+json, application/json")
                .header("Content-Type", "application/geo+json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                .build();

            HttpResponse<String> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw unavailable();
            }

            RouteResult result = parseRouteResponse(objectMapper.readTree(response.body()));
            if (result == null || result.distanceMeters() < 0 || result.trafficDurationSeconds() < 0) {
                throw unavailable();
            }
            writeCachedRoute(cacheKey, result);
            return result;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (OrderApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    private String requestBody(
        BigDecimal pickupLatitude,
        BigDecimal pickupLongitude,
        BigDecimal dropoffLatitude,
        BigDecimal dropoffLongitude
    ) throws Exception {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("type", "FeatureCollection");
        ArrayNode features = root.putArray("features");
        features.add(waypoint(0, pickupLatitude, pickupLongitude));
        features.add(waypoint(1, dropoffLatitude, dropoffLongitude));
        root.put("optimizeRoute", "fastestWithTraffic");
        root.putArray("routeOutputOptions").add("routePath");
        root.put("maxRouteCount", 1);
        root.put("travelMode", "driving");
        return objectMapper.writeValueAsString(root);
    }

    private ObjectNode waypoint(int index, BigDecimal latitude, BigDecimal longitude) {
        ObjectNode feature = objectMapper.createObjectNode();
        feature.put("type", "Feature");
        ObjectNode geometry = feature.putObject("geometry");
        geometry.put("type", "Point");
        geometry.putArray("coordinates")
            .add(longitude)
            .add(latitude);
        ObjectNode properties = feature.putObject("properties");
        properties.put("pointIndex", index);
        properties.put("pointType", "waypoint");
        return feature;
    }

    static RouteResult parseRouteResponse(JsonNode root) {
        JsonNode features = root == null ? null : root.get("features");
        if (features == null || !features.isArray()) {
            return null;
        }
        for (JsonNode feature : features) {
            JsonNode properties = feature == null ? null : feature.get("properties");
            if (properties == null || !properties.isObject()) {
                continue;
            }
            JsonNode type = properties.get("type");
            if (type == null || !"RoutePath".equals(type.asText())) {
                continue;
            }
            JsonNode distance = properties.get("distanceInMeters");
            JsonNode trafficDuration = properties.get("durationTrafficInSeconds");
            JsonNode duration = properties.get("durationInSeconds");
            if (distance == null || !distance.isNumber()) {
                continue;
            }
            long seconds = trafficDuration != null && trafficDuration.isNumber()
                ? trafficDuration.asLong()
                : duration != null && duration.isNumber() ? duration.asLong() : 0L;
            return new RouteResult(distance.asLong(), Math.max(seconds, 0L));
        }
        return null;
    }

    private RouteResult readCachedRoute(String key) {
        if (redisTemplate == null) {
            return null;
        }
        try {
            String cached = redisTemplate.opsForValue().get(key);
            if (cached == null || cached.isBlank()) {
                return null;
            }
            String[] parts = cached.split(":", 2);
            if (parts.length != 2) {
                return null;
            }
            long distance = Long.parseLong(parts[0]);
            long duration = Long.parseLong(parts[1]);
            return distance >= 0 && duration >= 0 ? new RouteResult(distance, duration) : null;
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private void writeCachedRoute(String key, RouteResult route) {
        if (redisTemplate == null) {
            return;
        }
        try {
            redisTemplate.opsForValue().set(
                key,
                route.distanceMeters() + ":" + route.trafficDurationSeconds(),
                routeCacheTtl
            );
        } catch (RuntimeException ignored) {
            // Redis is an optimization only. A cache outage must not break checkout pricing.
        }
    }

    private static String routeCacheKey(
        BigDecimal pickupLatitude,
        BigDecimal pickupLongitude,
        BigDecimal dropoffLatitude,
        BigDecimal dropoffLongitude
    ) {
        return ROUTE_CACHE_PREFIX
            + coordinate(pickupLatitude) + ":" + coordinate(pickupLongitude) + ":"
            + coordinate(dropoffLatitude) + ":" + coordinate(dropoffLongitude);
    }

    private static String coordinate(BigDecimal value) {
        return value.setScale(5, RoundingMode.HALF_UP).toPlainString();
    }

    private synchronized String managedIdentityToken() throws Exception {
        CachedToken current = cachedToken;
        if (current != null && current.expiresAt().isAfter(Instant.now().plusSeconds(60))) {
            return current.accessToken();
        }

        String identityEndpoint = requiredEnvironment("IDENTITY_ENDPOINT");
        String identityHeader = requiredEnvironment("IDENTITY_HEADER");
        String separator = identityEndpoint.contains("?") ? "&" : "?";
        URI uri = URI.create(
            identityEndpoint + separator
                + "resource=" + encode(AZURE_MAPS_RESOURCE)
                + "&api-version=2019-08-01"
        );
        HttpRequest request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(5))
            .header("X-IDENTITY-HEADER", identityHeader)
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(
            request,
            HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
        );
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw unavailable();
        }

        JsonNode body = objectMapper.readTree(response.body());
        String token = text(body == null ? null : body.get("access_token"));
        if (token == null) {
            throw unavailable();
        }
        Instant expiresAt = parseExpiry(body == null ? null : body.get("expires_on"));
        cachedToken = new CachedToken(token, expiresAt);
        return token;
    }

    private static void requireCoordinates(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null || longitude == null
            || latitude.compareTo(BigDecimal.valueOf(-90)) < 0
            || latitude.compareTo(BigDecimal.valueOf(90)) > 0
            || longitude.compareTo(BigDecimal.valueOf(-180)) < 0
            || longitude.compareTo(BigDecimal.valueOf(180)) > 0) {
            throw OrderApiException.badRequest(
                "DELIVERY_ROUTE_COORDINATES_INVALID",
                "Valid pickup and delivery coordinates are required to price delivery."
            );
        }
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw unavailable();
        }
        return value.trim();
    }

    private static String normalizeEndpoint(String endpoint) {
        String value = endpoint == null || endpoint.isBlank()
            ? "https://atlas.microsoft.com"
            : endpoint.trim();
        return value.replaceAll("/+$", "");
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String text(JsonNode node) {
        if (node == null || !node.isTextual()) {
            return null;
        }
        String value = node.asText().trim();
        return value.isEmpty() ? null : value;
    }

    private static Instant parseExpiry(JsonNode node) {
        if (node == null || node.isNull()) {
            return Instant.now().plusSeconds(300);
        }
        if (node.isNumber()) {
            return Instant.ofEpochSecond(node.asLong());
        }
        String value = text(node);
        if (value == null) {
            return Instant.now().plusSeconds(300);
        }
        try {
            return Instant.ofEpochSecond(Long.parseLong(value));
        } catch (NumberFormatException ignored) {
            try {
                return Instant.parse(value);
            } catch (DateTimeParseException ignoredAgain) {
                return Instant.now().plusSeconds(300);
            }
        }
    }

    private static OrderApiException unavailable() {
        return OrderApiException.serviceUnavailable(
            "DELIVERY_ROUTE_UNAVAILABLE",
            "Craves could not calculate the road route for this delivery right now. Please try again."
        );
    }

    private record CachedToken(String accessToken, Instant expiresAt) {
    }

    public record RouteResult(long distanceMeters, long trafficDurationSeconds) {
    }
}
