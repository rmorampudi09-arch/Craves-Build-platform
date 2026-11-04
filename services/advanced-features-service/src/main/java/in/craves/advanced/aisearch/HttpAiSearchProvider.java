package in.craves.advanced.aisearch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.advanced.aisearch.AiSearchDtos.AiChatMessage;
import in.craves.advanced.platform.clients.CappedBody;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Any provider with the OpenAI-compatible chat completions API (Azure OpenAI, OpenAI, Google Gemini, Anthropic and others offer
 * one). Set CRAVES_ADV_AI_SEARCH_URL (the full .../chat/completions address), CRAVES_ADV_AI_SEARCH_MODEL (model or deployment)
 * and CRAVES_ADV_AI_SEARCH_KEY; CRAVES_ADV_AI_SEARCH_KEY_HEADER is Authorization (sent as Bearer, the default) or the provider's
 * own header such as api-key (Azure); CRAVES_ADV_AI_SEARCH_TOKEN_FIELD names the answer-length field the model accepts
 * (max_completion_tokens by default, max_tokens for older APIs, none to leave it out) and CRAVES_ADV_AI_SEARCH_MAX_TOKENS its
 * value (400; reasoning models need more). A wrong setting leaves only this module unconfigured; it never stops the service.
 */
@Component
public class HttpAiSearchProvider implements AiSearchProvider {
    /** Provider calls in flight per replica; more turns at once fall back to plain semantic search instead of queueing. */
    static final int MAX_IN_FLIGHT = 4;
    static final int MAX_BODY = 64 * 1024;
    private static final Logger log = LoggerFactory.getLogger(HttpAiSearchProvider.class);

    private final ObjectMapper json;
    private final URI endpoint;
    private final String model;
    private final String key;
    private final String keyHeader;
    private final String tokenField;
    private final int maxTokens;
    private final Duration timeout;
    private final Semaphore permits = new Semaphore(MAX_IN_FLIGHT);
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    @Autowired
    public HttpAiSearchProvider(ObjectMapper json, @Value("${CRAVES_ADV_AI_SEARCH_URL:}") String url,
                                @Value("${CRAVES_ADV_AI_SEARCH_MODEL:}") String model, @Value("${CRAVES_ADV_AI_SEARCH_KEY:}") String key,
                                @Value("${CRAVES_ADV_AI_SEARCH_KEY_HEADER:Authorization}") String keyHeader,
                                @Value("${CRAVES_ADV_AI_SEARCH_TOKEN_FIELD:max_completion_tokens}") String tokenField,
                                @Value("${CRAVES_ADV_AI_SEARCH_MAX_TOKENS:400}") String maxTokens) {
        this(json, url, model, key, keyHeader, tokenField, tokens(maxTokens), Duration.ofSeconds(8));
    }

    HttpAiSearchProvider(ObjectMapper json, String url, String model, String key, String keyHeader, String tokenField, int maxTokens,
                         Duration timeout) {
        this.json = json;
        this.model = model == null ? "" : model.strip();
        this.key = key == null ? "" : key.strip();
        this.keyHeader = keyHeader == null || keyHeader.isBlank() ? "Authorization" : keyHeader.strip();
        this.tokenField = tokenField == null || tokenField.isBlank() ? "max_completion_tokens" : tokenField.strip();
        this.maxTokens = maxTokens;
        this.timeout = timeout;
        URI parsed = endpoint(url);
        boolean usable = parsed != null && !this.model.isEmpty() && !this.key.isEmpty() && this.keyHeader.matches("[A-Za-z0-9-]{1,40}")
                && this.tokenField.matches("[a-z_]{1,40}") && this.key.chars().noneMatch(c -> c < 0x21 || c > 0x7e);
        if (!usable && url != null && !url.isBlank()) {
            log.warn("AI search provider settings are incomplete or invalid; ai-search answers AI_SEARCH_NOT_CONFIGURED");
        }
        this.endpoint = usable ? parsed : null;
    }

    /** 50 to 8000; anything unreadable means 400. */
    static int tokens(String value) {
        try {
            return Math.max(50, Math.min(8000, Integer.parseInt(value == null ? "" : value.strip())));
        } catch (NumberFormatException ex) {
            return 400;
        }
    }

    /** HTTPS without credentials or fragment; plain http only for a local test server. */
    static URI endpoint(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            URI uri = URI.create(url.strip());
            boolean local = "http".equals(uri.getScheme()) && ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
            if (!("https".equals(uri.getScheme()) || local) || uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null) {
                return null;
            }
            return uri;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    @Override
    public boolean configured() {
        return endpoint != null;
    }

    @Override
    public Optional<String> complete(String systemPrompt, List<AiChatMessage> messages) {
        if (endpoint == null || !permits.tryAcquire()) return Optional.empty();
        CompletableFuture<HttpResponse<byte[]>> call = null;
        try {
            ObjectNode body = json.createObjectNode().put("model", model);
            ArrayNode chat = body.putArray("messages");
            chat.addObject().put("role", "system").put("content", systemPrompt);
            for (AiChatMessage message : messages) {
                chat.addObject().put("role", message.role().toLowerCase(Locale.ROOT)).put("content", message.text());
            }
            if (!"none".equals(tokenField)) body.put(tokenField, maxTokens);
            HttpRequest.Builder request = HttpRequest.newBuilder(endpoint).timeout(timeout).header("Content-Type", "application/json")
                    .header("Accept", "application/json").POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body)));
            request.header(keyHeader, "authorization".equalsIgnoreCase(keyHeader) ? "Bearer " + key : key);
            // The request timeout covers only the headers; this deadline covers the whole answer, body included.
            call = client.sendAsync(request.build(), CappedBody.handler(MAX_BODY));
            HttpResponse<byte[]> response = call.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() != 200 || response.body() == null) {
                // Status only: the body may echo the conversation.
                log.warn("AI search provider answered HTTP {}{}", response.statusCode(), response.body() == null ? " (answer too large)" : "");
                return Optional.empty();
            }
            JsonNode choice = json.readTree(response.body()).path("choices").path(0);
            JsonNode content = choice.path("message").path("content");
            if (!content.isTextual() || content.asText().isBlank()) {
                // A reasoning model can spend the whole token allowance thinking: finish_reason "length" says so.
                log.warn("AI search provider answer had no text (finish_reason {})", choice.path("finish_reason").asText("unknown"));
                return Optional.empty();
            }
            return Optional.of(content.asText());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (TimeoutException ex) {
            log.warn("AI search provider did not answer within {} ms", timeout.toMillis());
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("AI search provider call failed: {}", ex.getClass().getSimpleName());
            return Optional.empty();
        } finally {
            if (call != null) call.cancel(true);
            permits.release();
        }
    }
}
