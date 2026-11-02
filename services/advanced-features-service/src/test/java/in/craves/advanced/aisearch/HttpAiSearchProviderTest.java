package in.craves.advanced.aisearch;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.advanced.aisearch.AiSearchDtos.AiChatMessage;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Against a local stand-in for an OpenAI-compatible chat completions API. */
class HttpAiSearchProviderTest {
    static final ObjectMapper JSON = new ObjectMapper();
    HttpServer server;
    String url;
    final AtomicReference<JsonNode> lastBody = new AtomicReference<>();
    final AtomicReference<String> lastAuth = new AtomicReference<>();
    final AtomicReference<String> lastApiKey = new AtomicReference<>();
    volatile int status = 200;
    volatile String answer = "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"{\\\"reply\\\":\\\"ok\\\"}\"}}]}";

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/slow", exchange -> {
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(200, 0); // headers at once, then the body stalls
            exchange.getResponseBody().flush();
            try {
                Thread.sleep(4000);
                exchange.getResponseBody().write(answer.getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) {
                // the client gave up
            }
            exchange.close();
        });
        server.createContext("/v1/chat/completions", exchange -> {
            lastBody.set(JSON.readTree(exchange.getRequestBody().readAllBytes()));
            lastAuth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            lastApiKey.set(exchange.getRequestHeaders().getFirst("api-key"));
            byte[] bytes = answer.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
        url = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/chat/completions";
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    HttpAiSearchProvider provider(String keyHeader, String tokenField) {
        return new HttpAiSearchProvider(JSON, url, "small-model", "secret-key", keyHeader, tokenField, 400, Duration.ofSeconds(5));
    }

    @Test
    void sendsTheChatInTheOpenAiShapeAndReadsTheAnswer() {
        var reply = provider("Authorization", "max_completion_tokens").complete("SYSTEM", List.of(new AiChatMessage("USER", "dal"),
                new AiChatMessage("ASSISTANT", "Which dal?"), new AiChatMessage("USER", "tadka")));
        assertThat(reply).contains("{\"reply\":\"ok\"}");
        JsonNode body = lastBody.get();
        assertThat(body.path("model").asText()).isEqualTo("small-model");
        assertThat(body.path("max_completion_tokens").asInt()).isEqualTo(400);
        assertThat(body.path("messages").size()).isEqualTo(4);
        assertThat(body.path("messages").path(0).path("role").asText()).isEqualTo("system");
        assertThat(body.path("messages").path(0).path("content").asText()).isEqualTo("SYSTEM");
        assertThat(body.path("messages").path(2).path("role").asText()).isEqualTo("assistant");
        assertThat(body.path("messages").path(3).path("content").asText()).isEqualTo("tadka");
        assertThat(lastAuth.get()).isEqualTo("Bearer secret-key");
    }

    @Test
    void azureStyleKeyHeaderAndOlderTokenField() {
        provider("api-key", "max_tokens").complete("S", List.of(new AiChatMessage("USER", "x")));
        assertThat(lastApiKey.get()).isEqualTo("secret-key");
        assertThat(lastAuth.get()).isNull();
        assertThat(lastBody.get().has("max_tokens")).isTrue();
        provider("Authorization", "none").complete("S", List.of(new AiChatMessage("USER", "x")));
        assertThat(lastBody.get().has("max_tokens")).isFalse();
        assertThat(lastBody.get().has("max_completion_tokens")).isFalse();
    }

    @Test
    void failuresAndOddAnswersComeBackEmpty() {
        status = 500;
        assertThat(provider("Authorization", null).complete("S", List.of(new AiChatMessage("USER", "x")))).isEmpty();
        status = 200;
        answer = "{\"choices\":[]}";
        assertThat(provider("Authorization", null).complete("S", List.of(new AiChatMessage("USER", "x")))).isEmpty();
        answer = "not json";
        assertThat(provider("Authorization", null).complete("S", List.of(new AiChatMessage("USER", "x")))).isEmpty();
    }

    @Test
    void theDeadlineCoversTheWholeAnswerAndBigAnswersAreDropped() {
        var slow = new HttpAiSearchProvider(JSON, url.replace("/v1/chat/completions", "/slow"), "m", "k", null, null, 400, Duration.ofSeconds(1));
        long started = System.nanoTime();
        assertThat(slow.complete("S", List.of(new AiChatMessage("USER", "x")))).isEmpty();
        assertThat(System.nanoTime() - started).isLessThan(3_000_000_000L);
        answer = "{\"choices\":[{\"message\":{\"content\":\"" + "x".repeat(HttpAiSearchProvider.MAX_BODY) + "\"}}]}";
        assertThat(provider("Authorization", null).complete("S", List.of(new AiChatMessage("USER", "x")))).isEmpty();
        answer = "{\"choices\":[{\"message\":{\"content\":\"\"},\"finish_reason\":\"length\"}]}";
        assertThat(provider("Authorization", null).complete("S", List.of(new AiChatMessage("USER", "x")))).isEmpty();
    }

    @Test
    void answerLengthSettingIsBounded() {
        assertThat(HttpAiSearchProvider.tokens("2000")).isEqualTo(2000);
        assertThat(HttpAiSearchProvider.tokens("1")).isEqualTo(50);
        assertThat(HttpAiSearchProvider.tokens("99999")).isEqualTo(8000);
        assertThat(HttpAiSearchProvider.tokens("lots")).isEqualTo(400);
        assertThat(HttpAiSearchProvider.tokens(null)).isEqualTo(400);
    }

    @Test
    void incompleteOrUnsafeSettingsLeaveItUnconfigured() {
        assertThat(provider("Authorization", null).configured()).isTrue();
        assertThat(new HttpAiSearchProvider(JSON, "", "m", "k", null, null, 400, Duration.ofSeconds(1)).configured()).isFalse();
        assertThat(new HttpAiSearchProvider(JSON, url, "", "k", null, null, 400, Duration.ofSeconds(1)).configured()).isFalse();
        assertThat(new HttpAiSearchProvider(JSON, url, "m", " ", null, null, 400, Duration.ofSeconds(1)).configured()).isFalse();
        assertThat(new HttpAiSearchProvider(JSON, "http://example.com/v1/chat/completions", "m", "k", null, null, 400, Duration.ofSeconds(1)).configured()).isFalse();
        assertThat(new HttpAiSearchProvider(JSON, "https://user:pw@example.com/v1", "m", "k", null, null, 400, Duration.ofSeconds(1)).configured()).isFalse();
        assertThat(new HttpAiSearchProvider(JSON, url, "m", "k", "bad header", null, 400, Duration.ofSeconds(1)).configured()).isFalse();
        assertThat(new HttpAiSearchProvider(JSON, url, "m", "key with space", null, null, 400, Duration.ofSeconds(1)).configured()).isFalse();
        assertThat(new HttpAiSearchProvider(JSON, "https://example.openai.azure.com/openai/v1/chat/completions", "m", "k", "api-key", null, 400,
                Duration.ofSeconds(1)).configured()).isTrue();
        assertThat(new HttpAiSearchProvider(JSON, "", "m", "k", null, null, 400, Duration.ofSeconds(1))
                .complete("S", List.of(new AiChatMessage("USER", "x")))).isEmpty();
    }
}
