package in.craves.integration.delivery.pidge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PidgeProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** No automatic retries: quote calls are chargeable and mutations are not idempotent. */
@Component
public class PidgeTransport {
    private final PidgeProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient client;

    @Autowired
    public PidgeTransport(PidgeProperties properties, ObjectMapper mapper) {
        this(properties, mapper, HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(properties.getConnectTimeoutSeconds()))
            .followRedirects(HttpClient.Redirect.NEVER).build());
    }

    PidgeTransport(PidgeProperties properties, ObjectMapper mapper, HttpClient client) {
        this.properties = properties;
        this.mapper = mapper;
        this.client = client;
    }

    public JsonNode get(String path) { return request("GET", path, null, false); }
    public JsonNode quote(JsonNode body) { return request("POST", "/v1.0/store/channel/vendor/quote", body, false); }
    public JsonNode mutate(String path, JsonNode body) { return request("POST", path, body, true); }

    private JsonNode request(String method, String path, JsonNode body, boolean mutation) {
        if (!properties.isEnabled() || !properties.credentialReady())
            throw new ApiException("Pidge API is disabled or credentials are missing", false);
        properties.validate();
        if (!path.startsWith("/v1.0/store/channel/vendor/") || path.contains(".."))
            throw new IllegalArgumentException("Unsupported Pidge API path");
        String token = properties.getAuthToken().trim();
        if (!token.regionMatches(true, 0, "Bearer ", 0, 7)) token = "Bearer " + token;
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(properties.getBaseUrl() + path))
            .timeout(Duration.ofSeconds(properties.getReadTimeoutSeconds()))
            .header("Authorization", token).header("Accept", "application/json");
        if ("POST".equals(method)) request.header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body == null ? "{}" : body.toString()));
        else request.GET();
        try {
            HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status < 200 || status >= 300)
                throw new ApiException("Pidge API HTTP " + status,
                    mutation && (status >= 500 || status == 408 || status == 429 || status < 400));
            JsonNode parsed;
            try { parsed = mapper.readTree(response.body()); }
            catch (Exception ex) { throw new ApiException("Pidge returned invalid JSON", mutation); }
            if (parsed == null || !parsed.isObject())
                throw new ApiException("Pidge returned an invalid response object", mutation);
            if (parsed.hasNonNull("error")) throw new ApiException("Pidge reported an API error", mutation);
            return parsed;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException("Pidge request interrupted", mutation);
        } catch (IOException ex) {
            throw new ApiException("Pidge response was not received", mutation);
        }
    }

    public static class ApiException extends RuntimeException {
        private final boolean uncertain;
        public ApiException(String message, boolean uncertain) { super(message); this.uncertain = uncertain; }
        public boolean uncertain() { return uncertain; }
    }
}
