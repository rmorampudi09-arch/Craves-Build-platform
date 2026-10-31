package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.web.ApiProblem;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import org.slf4j.MDC;

/** Small bounded HTTP client for Craves APIs: short timeouts, no redirects, capped bodies, bounded concurrency. */
final class GatewayHttp {
    record Reply(int status, JsonNode body) { }

    private static final int MAX_BODY = 2 * 1024 * 1024;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final Semaphore permits = new Semaphore(32);
    private final ObjectMapper json;
    private final String origin;
    private final String unavailableCode;

    GatewayHttp(ObjectMapper json, String origin, String unavailableCode) {
        this.json = json;
        this.origin = origin;
        this.unavailableCode = unavailableCode;
    }

    Reply send(String method, String path, String bearer, Object body) {
        if (!permits.tryAcquire()) throw unavailable();
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(origin + path)).timeout(Duration.ofSeconds(5))
                    .header("Accept", "application/json");
            String correlation = MDC.get("correlationId");
            if (correlation != null) request.header("X-Correlation-ID", correlation);
            if (bearer != null) request.header("Authorization", "Bearer " + bearer);
            if (body != null) {
                request.header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body)));
            } else {
                request.method(method, HttpRequest.BodyPublishers.noBody());
            }
            HttpResponse<InputStream> response = client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = response.body()) {
                byte[] bytes = in.readNBytes(MAX_BODY + 1);
                if (bytes.length > MAX_BODY) throw unavailable();
                JsonNode parsed = bytes.length == 0 ? null : json.readTree(bytes);
                return new Reply(response.statusCode(), parsed);
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (IOException ex) {
            throw unavailable();
        } finally {
            permits.release();
        }
    }

    ApiProblem unavailable() {
        return ApiProblem.unavailable(unavailableCode, "A Craves service this feature depends on is not answering; retry shortly");
    }
}
