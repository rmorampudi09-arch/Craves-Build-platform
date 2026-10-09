package in.craves.userchef.location;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.exception.ApiException;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Server-side Ola Maps (Krutrim) client; the API key never leaves this service. */
@Component
public class OlaMapsClient {
    private static final Logger log = LoggerFactory.getLogger(OlaMapsClient.class);
    private static final URI OLA_MAPS_ENDPOINT = URI.create("https://api.olamaps.io");
    // The Ola credential restricts callers by domain; server calls are made on behalf of this site.
    private static final String CRAVES_ORIGIN = "https://craves.in";
    private static final int MAX_RESPONSE_BYTES = 512 * 1024;
    private static final int MAX_SEARCH_RESULTS = 6;
    private static final Pattern PIN_CODE = Pattern.compile("\\b[1-9]\\d{5}\\b");
    private static final Map<String, String> CONFIDENCE = Map.of(
        "rooftop", "High",
        "range_interpolated", "Medium",
        "geometric_center", "Medium",
        "approximate", "Low"
    );
    private static final String REVERSE_GEOCODING = "reverse geocoding";
    private static final String AUTOCOMPLETE = "autocomplete";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI endpoint;
    private final String apiKey;
    private final String defaultSearchCenter;
    private final Duration timeout;

    @Autowired
    public OlaMapsClient(ObjectMapper objectMapper) {
        this(
            objectMapper,
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build(),
            OLA_MAPS_ENDPOINT,
            System.getenv("OLA_MAPS_API_KEY"),
            System.getenv("CRAVES_LOCATION_SEARCH_CENTER"),
            Duration.ofSeconds(7)
        );
    }

    OlaMapsClient(
        ObjectMapper objectMapper,
        HttpClient httpClient,
        URI endpoint,
        String apiKey,
        String defaultSearchCenter,
        Duration timeout
    ) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.endpoint = endpoint;
        this.apiKey = apiKey == null || apiKey.isBlank() ? null : apiKey.trim();
        this.defaultSearchCenter = parseCenter(defaultSearchCenter);
        this.timeout = timeout;
    }

    public ReverseGeocodedAddress reverseGeocode(BigDecimal latitude, BigDecimal longitude) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("latlng", latitude.toPlainString() + "," + longitude.toPlainString());
        ReverseGeocodedAddress parsed = parseReverseGeocode(get(REVERSE_GEOCODING, "/places/v1/reverse-geocode", params));
        if (parsed == null) {
            throw unavailable(REVERSE_GEOCODING, "no usable address in response", null);
        }
        return parsed;
    }

    public List<LocationSuggestion> search(String query, BigDecimal latitude, BigDecimal longitude) {
        String input = query == null ? "" : query.trim();
        if (input.length() < 2 || input.length() > 160) {
            return List.of();
        }
        Map<String, String> params = new LinkedHashMap<>();
        params.put("input", input);
        // A bias, not a restriction: addresses in other Indian cities still match.
        String near = latitude != null && longitude != null
            ? latitude.toPlainString() + "," + longitude.toPlainString()
            : defaultSearchCenter;
        if (near != null) {
            params.put("location", near);
        }
        return parseAutocomplete(get(AUTOCOMPLETE, "/places/v1/autocomplete", params));
    }

    private JsonNode get(String operation, String path, Map<String, String> params) {
        if (apiKey == null) {
            throw unavailable(operation, "OLA_MAPS_API_KEY is not configured", null);
        }
        StringBuilder query = new StringBuilder();
        params.forEach((name, value) -> query.append(name).append('=').append(encode(value)).append('&'));
        query.append("api_key=").append(encode(apiKey));
        String requestId = UUID.randomUUID().toString();
        HttpRequest request = HttpRequest.newBuilder(endpoint.resolve(path + "?" + query))
            .timeout(timeout)
            .header("Accept", "application/json")
            .header("Accept-Language", "en-IN")
            .header("Origin", CRAVES_ORIGIN)
            .header("Referer", CRAVES_ORIGIN + "/")
            .header("X-Request-Id", requestId)
            .GET()
            .build();

        CompletableFuture<HttpResponse<byte[]>> pending =
            httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray());
        HttpResponse<byte[]> response;
        try {
            // Whole-exchange deadline, including a stalled body.
            response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            pending.cancel(true);
            throw unavailable(operation, "timeout", requestId);
        } catch (ExecutionException exception) {
            throw unavailable(
                operation,
                exception.getCause() instanceof HttpTimeoutException ? "timeout" : "network error",
                requestId
            );
        } catch (InterruptedException exception) {
            pending.cancel(true);
            Thread.currentThread().interrupt();
            throw unavailable(operation, "interrupted", requestId);
        }

        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            throw unavailable(operation, status == 429 ? "rate limited (HTTP 429)" : "HTTP " + status, requestId);
        }
        byte[] body = response.body();
        if (body == null || body.length > MAX_RESPONSE_BYTES) {
            throw unavailable(operation, "response too large or empty", requestId);
        }
        try {
            return objectMapper.readTree(body);
        } catch (IOException exception) {
            throw unavailable(operation, "invalid JSON response", requestId);
        }
    }

    static ReverseGeocodedAddress parseReverseGeocode(JsonNode root) {
        JsonNode results = root == null ? null : root.get("results");
        if (results == null || !results.isArray()) {
            return null;
        }
        for (JsonNode result : results) {
            String formattedAddress = text(result.get("formatted_address"));
            if (formattedAddress == null) {
                continue;
            }
            Map<String, String> components = components(result.get("address_components"));
            String houseNumber = first(components, "street_number", "premise");
            String district = first(components, "administrative_area_level_2");
            String locality = first(components, "locality");
            String postalCode = first(components, "postal_code");
            if (postalCode == null) {
                Matcher pinCode = PIN_CODE.matcher(formattedAddress);
                postalCode = pinCode.find() ? pinCode.group() : null;
            }
            String locationType = text(result.path("geometry").get("location_type"));

            return new ReverseGeocodedAddress(
                formattedAddress,
                houseNumber,
                first(components, "route", "street_address"),
                firstText(
                    first(components, "sublocality_level_1", "sublocality", "neighborhood", "sublocality_level_2"),
                    locality,
                    district
                ),
                firstText(locality, first(components, "administrative_area_level_3"), district),
                district,
                first(components, "administrative_area_level_1"),
                postalCode,
                first(components, "country"),
                locationType == null ? null : CONFIDENCE.get(locationType.toLowerCase(Locale.ROOT)),
                houseNumber != null
            );
        }
        return null;
    }

    static List<LocationSuggestion> parseAutocomplete(JsonNode root) {
        JsonNode predictions = root == null ? null : root.get("predictions");
        if (predictions == null || !predictions.isArray()) {
            return List.of();
        }
        List<LocationSuggestion> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode prediction : predictions) {
            if (results.size() >= MAX_SEARCH_RESULTS) {
                break;
            }
            JsonNode location = prediction.path("geometry").path("location");
            String formattedAddress = text(prediction.get("description"));
            if (formattedAddress == null || !location.path("lat").isNumber() || !location.path("lng").isNumber()) {
                continue;
            }
            double latitude = location.path("lat").asDouble();
            double longitude = location.path("lng").asDouble();
            if (!Double.isFinite(latitude) || Math.abs(latitude) > 90
                || !Double.isFinite(longitude) || Math.abs(longitude) > 180) {
                continue;
            }
            String placeId = text(prediction.get("place_id"));
            String id = placeId != null ? placeId : "result-" + latitude + "-" + longitude;
            if (!seen.add(id)) {
                continue;
            }
            JsonNode formatting = prediction.path("structured_formatting");
            String title = text(formatting.get("main_text"));
            results.add(new LocationSuggestion(
                id,
                title != null ? title : formattedAddress.split(",")[0].trim(),
                text(formatting.get("secondary_text")),
                formattedAddress,
                latitude,
                longitude,
                // Autocomplete has no structured address; reverse geocoding the final pin fills these.
                null, null, null, null, null, null, null
            ));
        }
        return results;
    }

    private static Map<String, String> components(JsonNode values) {
        Map<String, String> byType = new HashMap<>();
        if (values == null || !values.isArray()) {
            return byType;
        }
        for (JsonNode component : values) {
            String value = firstText(text(component.get("long_name")), text(component.get("short_name")));
            JsonNode types = component.get("types");
            if (value == null || types == null || !types.isArray()) {
                continue;
            }
            for (JsonNode type : types) {
                if (type.isTextual()) {
                    byType.putIfAbsent(type.asText(), value);
                }
            }
        }
        return byType;
    }

    private static String first(Map<String, String> components, String... types) {
        for (String type : types) {
            String value = components.get(type);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String parseCenter(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String[] parts = value.split(",");
        try {
            if (parts.length == 2) {
                BigDecimal latitude = new BigDecimal(parts[0].trim());
                BigDecimal longitude = new BigDecimal(parts[1].trim());
                if (latitude.abs().compareTo(BigDecimal.valueOf(90)) <= 0
                    && longitude.abs().compareTo(BigDecimal.valueOf(180)) <= 0) {
                    return latitude.toPlainString() + "," + longitude.toPlainString();
                }
            }
        } catch (NumberFormatException ignored) {
            // Fall through: an invalid optional bias is ignored rather than failing startup.
        }
        log.warn("Ignoring invalid CRAVES_LOCATION_SEARCH_CENTER; expected \"latitude,longitude\"");
        return null;
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static String text(JsonNode node) {
        if (node == null || !node.isTextual()) {
            return null;
        }
        String value = node.asText().trim();
        return value.isEmpty() ? null : value;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    /** Logs only the operation, reason and request id: never the URL (it carries the key), coordinates or query. */
    private static ApiException unavailable(String operation, String reason, String requestId) {
        log.warn("Ola Maps {} unavailable: {}{}", operation, reason, requestId == null ? "" : " (request " + requestId + ")");
        return REVERSE_GEOCODING.equals(operation)
            ? new ApiException(503, "REVERSE_GEOCODING_UNAVAILABLE",
                "Craves could not identify this address right now. Please try again.")
            : new ApiException(503, "LOCATION_SEARCH_UNAVAILABLE",
                "Address search is unavailable right now. Please try again.");
    }

    public record ReverseGeocodedAddress(
        String formattedAddress,
        String houseNumber,
        String street,
        String area,
        String city,
        String district,
        String state,
        String postalCode,
        String country,
        String confidence,
        boolean preciseHouseNumber
    ) {
    }

    public record LocationSuggestion(
        String id,
        String title,
        String subtitle,
        String formattedAddress,
        double latitude,
        double longitude,
        String houseNumber,
        String street,
        String area,
        String district,
        String city,
        String state,
        String postalCode
    ) {
    }
}
