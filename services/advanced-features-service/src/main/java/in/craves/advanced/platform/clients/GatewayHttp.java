package in.craves.advanced.platform.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.web.ApiProblem;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.MDC;

/** Small bounded HTTP client for Craves APIs: short timeouts, no redirects, capped bodies, bounded concurrency. */
final class GatewayHttp {
    record Reply(int status, JsonNode body) { }

    private static final int MAX_BODY = 2 * 1024 * 1024;
    private static final Duration DEADLINE = Duration.ofSeconds(5);
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
        CompletableFuture<HttpResponse<byte[]>> call = null;
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
            // The request timeout covers only the headers; this deadline covers the whole answer, body included.
            call = client.sendAsync(request.build(), CappedBody.handler(MAX_BODY));
            HttpResponse<byte[]> response = call.get(DEADLINE.toMillis(), TimeUnit.MILLISECONDS);
            if (response.body() == null) throw unavailable();
            JsonNode parsed = response.body().length == 0 ? null : json.readTree(response.body());
            return new Reply(response.statusCode(), parsed);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (IOException | ExecutionException | TimeoutException ex) {
            throw unavailable();
        } finally {
            if (call != null) call.cancel(true);
            permits.release();
        }
    }

    ApiProblem unavailable() {
        return ApiProblem.unavailable(unavailableCode, "A Craves service this feature depends on is not answering; retry shortly");
    }
}
