package in.craves.userchef.location;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.userchef.exception.ApiException;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class OlaMapsClientTest {
    private static final String KEY = "fixture-ola-key-0123456789abcdef";
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String MADHAPUR = """
        {
          "status": "ok",
          "results": [
            {
              "formatted_address": "Plot 12, Ayyappa Society Main Road, Madhapur, Hyderabad, Telangana, 500081, India",
              "geometry": {"location": {"lat": 17.4483, "lng": 78.3915}, "location_type": "rooftop"},
              "address_components": [
                {"types": ["street_number"], "long_name": "Plot 12", "short_name": "Plot 12"},
                {"types": ["route"], "long_name": "Ayyappa Society Main Road", "short_name": "Ayyappa Society Main Road"},
                {"types": ["sublocality_level_1", "sublocality"], "long_name": "Madhapur", "short_name": "Madhapur"},
                {"types": ["locality"], "long_name": "Hyderabad", "short_name": "Hyderabad"},
                {"types": ["administrative_area_level_2"], "long_name": "Rangareddy", "short_name": "Rangareddy"},
                {"types": ["administrative_area_level_1"], "long_name": "Telangana", "short_name": "TG"},
                {"types": ["postal_code"], "long_name": "500081", "short_name": "500081"},
                {"types": ["country"], "long_name": "India", "short_name": "IN"}
              ]
            }
          ]
        }
        """;

    @Test
    void normalizesOlaReverseGeocodeForIndianAddressForm() throws Exception {
        var result = OlaMapsClient.parseReverseGeocode(objectMapper.readTree(MADHAPUR));

        assertEquals("Plot 12, Ayyappa Society Main Road, Madhapur, Hyderabad, Telangana, 500081, India", result.formattedAddress());
        assertEquals("Plot 12", result.houseNumber());
        assertEquals("Ayyappa Society Main Road", result.street());
        assertEquals("Madhapur", result.area());
        assertEquals("Hyderabad", result.city());
        assertEquals("Rangareddy", result.district());
        assertEquals("Telangana", result.state());
        assertEquals("500081", result.postalCode());
        assertEquals("India", result.country());
        assertEquals("High", result.confidence());
        assertTrue(result.preciseHouseNumber());
    }

    @Test
    void fallsBackWithoutInventingPrivateHouseNumber() throws Exception {
        String json = """
            {"status": "ok", "results": [{
              "formatted_address": "Kondapur, Serilingampalle, Rangareddy, Telangana, 500084, India",
              "geometry": {"location_type": "approximate"},
              "address_components": [
                {"types": ["locality"], "long_name": "Kondapur"},
                {"types": ["administrative_area_level_2"], "long_name": "Rangareddy"},
                {"types": ["administrative_area_level_1"], "long_name": "Telangana"}
              ]
            }]}
            """;

        var result = OlaMapsClient.parseReverseGeocode(objectMapper.readTree(json));

        assertNull(result.houseNumber());
        assertFalse(result.preciseHouseNumber());
        assertEquals("Kondapur", result.area());
        assertEquals("Kondapur", result.city());
        assertEquals("Rangareddy", result.district());
        assertEquals("500084", result.postalCode());
        assertEquals("Low", result.confidence());
        assertNull(result.country());
    }

    @Test
    void rejectsUnusableReverseGeocodeBodies() throws Exception {
        assertNull(OlaMapsClient.parseReverseGeocode(objectMapper.readTree("{\"status\":\"zero_results\",\"results\":[]}")));
        assertNull(OlaMapsClient.parseReverseGeocode(objectMapper.readTree("{\"results\":[{\"address_components\":[]}]}")));
        assertNull(OlaMapsClient.parseReverseGeocode(objectMapper.readTree("{\"results\":\"invalid\"}")));
        assertNull(OlaMapsClient.parseReverseGeocode(null));
    }

    @Test
    void keepsOnlyUsableUniqueAutocompletePredictions() throws Exception {
        String json = """
            {"status": "ok", "predictions": [
              {"place_id": "ola-platform:madhapur", "description": "Madhapur, Hyderabad, Telangana, India",
               "structured_formatting": {"main_text": "Madhapur", "secondary_text": "Hyderabad, Telangana, India"},
               "geometry": {"location": {"lat": 17.4483, "lng": 78.3915}}},
              {"place_id": "ola-platform:no-geometry", "description": "No geometry, Hyderabad"},
              {"place_id": "ola-platform:madhapur", "description": "Duplicate, Hyderabad",
               "geometry": {"location": {"lat": 17.4483, "lng": 78.3915}}},
              {"place_id": "ola-platform:bad", "description": "Out of range", "geometry": {"location": {"lat": 95, "lng": 78.3}}},
              {"place_id": "ola-platform:metro", "description": "Madhapur Metro Station, Hyderabad",
               "geometry": {"location": {"lat": 17.4374, "lng": 78.3897}}}
            ]}
            """;

        var results = OlaMapsClient.parseAutocomplete(objectMapper.readTree(json));

        assertEquals(2, results.size());
        assertEquals("ola-platform:madhapur", results.get(0).id());
        assertEquals("Madhapur", results.get(0).title());
        assertEquals("Hyderabad, Telangana, India", results.get(0).subtitle());
        assertEquals(17.4483, results.get(0).latitude());
        assertEquals("Madhapur Metro Station", results.get(1).title());
        assertNull(results.get(1).subtitle());
        assertNull(results.get(1).postalCode());
        assertTrue(OlaMapsClient.parseAutocomplete(objectMapper.readTree("{\"status\":\"ok\",\"predictions\":[]}")).isEmpty());
    }

    @Test
    void sendsKeyOnlyAsQueryParameterWithCravesOrigin() throws Exception {
        try (var stub = new Stub(200, MADHAPUR, 0)) {
            var result = stub.client("17.3850,78.4867").reverseGeocode(new BigDecimal("17.4483"), new BigDecimal("78.3915"));

            assertEquals("Madhapur", result.area());
            var request = stub.requests.get(0);
            assertEquals("/places/v1/reverse-geocode", request.path());
            assertEquals("17.4483,78.3915", request.query().get("latlng"));
            assertEquals(KEY, request.query().get("api_key"));
            assertEquals("https://craves.in", request.origin());
        }
    }

    @Test
    void searchUsesCallerBiasElseConfiguredCenter() throws Exception {
        try (var stub = new Stub(200, "{\"status\":\"ok\",\"predictions\":[]}", 0)) {
            var client = stub.client("17.3850,78.4867");
            assertTrue(client.search("  Kondapur ", null, null).isEmpty());
            assertTrue(client.search("Kondapur", new BigDecimal("12.9716"), new BigDecimal("77.5946")).isEmpty());
            assertTrue(client.search("K", null, null).isEmpty());
            assertEquals(2, stub.requests.size());

            assertTrue(stub.client("not-a-point").search("Kondapur", null, null).isEmpty());

            assertEquals("Kondapur", stub.requests.get(0).query().get("input"));
            assertEquals("17.3850,78.4867", stub.requests.get(0).query().get("location"));
            assertEquals("12.9716,77.5946", stub.requests.get(1).query().get("location"));
            assertFalse(stub.requests.get(2).query().containsKey("location"));
        }
    }

    @Test
    void mapsProviderFailuresToServiceUnavailableWithoutLeakingKey() throws Exception {
        for (int status : new int[] {400, 401, 403, 429, 500, 503}) {
            try (var stub = new Stub(status, "{\"message\":\"Domain is not allowed\"}", 0)) {
                var failure = assertThrows(ApiException.class,
                    () -> stub.client(null).reverseGeocode(new BigDecimal("17.4483"), new BigDecimal("78.3915")));
                assertEquals(503, failure.getStatus());
                assertEquals("REVERSE_GEOCODING_UNAVAILABLE", failure.getCode());
                assertFalse(failure.getMessage().contains(KEY));

                var searchFailure = assertThrows(ApiException.class, () -> stub.client(null).search("Madhapur", null, null));
                assertEquals("LOCATION_SEARCH_UNAVAILABLE", searchFailure.getCode());
            }
        }
    }

    @Test
    void failsClosedWithoutKeyAndOnInvalidJsonOrTimeout() throws Exception {
        try (var stub = new Stub(200, "not json", 0)) {
            var unconfigured = new OlaMapsClient(objectMapper, HttpClient.newHttpClient(), stub.endpoint(), " ", null, Duration.ofSeconds(2));
            assertEquals(503, assertThrows(ApiException.class,
                () -> unconfigured.reverseGeocode(BigDecimal.ZERO, BigDecimal.ZERO)).getStatus());
            assertTrue(stub.requests.isEmpty());

            assertEquals(503, assertThrows(ApiException.class,
                () -> stub.client(null).reverseGeocode(BigDecimal.ZERO, BigDecimal.ZERO)).getStatus());
        }
        try (var stub = new Stub(200, MADHAPUR, 2_000)) {
            long started = System.nanoTime();
            var client = new OlaMapsClient(objectMapper, HttpClient.newHttpClient(), stub.endpoint(), KEY, null, Duration.ofMillis(300));
            assertEquals(503, assertThrows(ApiException.class,
                () -> client.reverseGeocode(BigDecimal.ONE, BigDecimal.ONE)).getStatus());
            assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 1_500);
        }
    }

    private record Recorded(String path, Map<String, String> query, String origin) {
    }

    /** Local JDK HTTP stub; no live Ola request is ever made. */
    private final class Stub implements AutoCloseable {
        private final HttpServer server;
        private final List<Recorded> requests = new CopyOnWriteArrayList<>();

        Stub(int status, String body, long delayMillis) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(Executors.newCachedThreadPool());
            server.createContext("/", exchange -> {
                Map<String, String> query = new HashMap<>();
                String raw = exchange.getRequestURI().getRawQuery();
                for (String pair : raw == null ? new String[0] : raw.split("&")) {
                    String[] parts = pair.split("=", 2);
                    query.put(URLDecoder.decode(parts[0], StandardCharsets.UTF_8),
                        parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "");
                }
                requests.add(new Recorded(exchange.getRequestURI().getPath(), query,
                    exchange.getRequestHeaders().getFirst("Origin")));
                try {
                    Thread.sleep(delayMillis);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
            });
            server.start();
        }

        URI endpoint() {
            return URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        }

        OlaMapsClient client(String center) {
            return new OlaMapsClient(objectMapper, HttpClient.newHttpClient(), endpoint(), KEY, center, Duration.ofSeconds(2));
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }
}
