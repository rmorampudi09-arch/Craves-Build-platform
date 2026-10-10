package in.craves.userchef.supportchat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.userchef.exception.ApiException;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Server-side Claude Messages API client. The key never leaves this service and chat text is never logged. */
@Component
public class ClaudeMessagesClient {
    private static final Logger log = LoggerFactory.getLogger(ClaudeMessagesClient.class);
    private static final URI ENDPOINT = URI.create("https://api.anthropic.com/v1/messages");
    private static final String DEFAULT_MODEL = "claude-haiku-5-5";
    private static final int MAX_RESPONSE_BYTES = 256 * 1024;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final URI endpoint;
    private final String apiKey;
    private final String model;

    @Autowired
    public ClaudeMessagesClient(ObjectMapper objectMapper) {
        this(
            objectMapper,
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build(),
            ENDPOINT,
            System.getenv("ANTHROPIC_API_KEY"),
            System.getenv("CRAVES_SUPPORT_CHAT_MODEL")
        );
    }

    ClaudeMessagesClient(ObjectMapper objectMapper, HttpClient httpClient, URI endpoint, String apiKey, String model) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.endpoint = endpoint;
        this.apiKey = apiKey == null || apiKey.isBlank() ? null : apiKey.trim();
        this.model = model == null || model.isBlank() ? DEFAULT_MODEL : model.trim();
    }

    /** False until the Key Vault secret is bound; removing the binding is the kill switch. */
    public boolean configured() {
        return apiKey != null;
    }

    /** Sends one Messages API request (the model is filled in here) and returns the parsed response. */
    public JsonNode create(ObjectNode body, Duration timeout) {
        if (apiKey == null) {
            throw unavailable("ANTHROPIC_API_KEY is not configured", null);
        }
        byte[] payload;
        try {
            payload = objectMapper.writeValueAsBytes(body.put("model", model));
        } catch (IOException exception) {
            throw unavailable("request could not be serialized", null);
        }
        HttpRequest request = HttpRequest.newBuilder(endpoint)
            .timeout(timeout)
            .header("content-type", "application/json")
            .header("x-api-key", apiKey)
            .header("anthropic-version", "2023-06-01")
            .POST(HttpRequest.BodyPublishers.ofByteArray(payload))
            .build();

        CompletableFuture<HttpResponse<byte[]>> pending =
            httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray());
        HttpResponse<byte[]> response;
        try {
            // Whole-exchange deadline, including a stalled body.
            response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            pending.cancel(true);
            throw unavailable("timeout", null);
        } catch (ExecutionException exception) {
            throw unavailable(exception.getCause() instanceof HttpTimeoutException ? "timeout" : "network error", null);
        } catch (InterruptedException exception) {
            pending.cancel(true);
            Thread.currentThread().interrupt();
            throw unavailable("interrupted", null);
        }

        String requestId = response.headers().firstValue("request-id").orElse(null);
        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            // 400 here usually means a spend limit or exhausted credits; 429/529 mean overload.
            throw unavailable("HTTP " + status, requestId);
        }
        byte[] bytes = response.body();
        if (bytes == null || bytes.length > MAX_RESPONSE_BYTES) {
            throw unavailable("response too large or empty", requestId);
        }
        JsonNode parsed;
        try {
            parsed = objectMapper.readTree(bytes);
        } catch (IOException exception) {
            throw unavailable("invalid JSON response", requestId);
        }
        JsonNode usage = parsed.path("usage");
        log.info("Support chat model call: stop={} input_tokens={} cache_read_tokens={} output_tokens={} request={}",
            parsed.path("stop_reason").asText(""), usage.path("input_tokens").asLong(),
            usage.path("cache_read_input_tokens").asLong(), usage.path("output_tokens").asLong(), requestId);
        return parsed;
    }

    /** Logs only the reason and Anthropic's request id: never the key, prompt or reply. */
    private static ApiException unavailable(String reason, String requestId) {
        log.warn("Support chat model unavailable: {}{}", reason, requestId == null ? "" : " (request " + requestId + ")");
        return SupportAssistant.unavailable();
    }
}
