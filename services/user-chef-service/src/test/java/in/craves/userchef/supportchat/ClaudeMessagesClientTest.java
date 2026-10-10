package in.craves.userchef.supportchat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.userchef.exception.ApiException;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;

class ClaudeMessagesClientTest {
    private static final String KEY = "fixture-claude-key-0123456789";
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void sendsKeyVersionAndModelAndReturnsTheResponse() throws Exception {
        try (Stub stub = new Stub(200, "{\"stop_reason\":\"end_turn\",\"content\":[{\"type\":\"text\",\"text\":\"Hi\"}]}")) {
            JsonNode response = client(stub, KEY).create(objectMapper.createObjectNode().put("max_tokens", 10), Duration.ofSeconds(2));

            assertEquals("Hi", response.path("content").get(0).path("text").asText());
            Map<String, String> sent = stub.requests.get(0);
            assertEquals(KEY, sent.get("x-api-key"));
            assertEquals("2023-06-01", sent.get("anthropic-version"));
            JsonNode body = objectMapper.readTree(sent.get("body"));
            assertEquals("claude-haiku-5-5", body.path("model").asText());
            assertEquals(10, body.path("max_tokens").asInt());
        }
    }

    @Test
    void providerErrorsBecomeServiceUnavailable() throws Exception {
        try (Stub stub = new Stub(400, "{\"type\":\"error\",\"error\":{\"message\":\"credit balance is too low\"}}")) {
            ApiException error = assertThrows(ApiException.class,
                () -> client(stub, KEY).create(objectMapper.createObjectNode(), Duration.ofSeconds(2)));

            assertEquals(503, error.getStatus());
            assertEquals("SUPPORT_CHAT_UNAVAILABLE", error.getCode());
            assertFalse(error.getMessage().contains("credit"));
        }
    }

    @Test
    void missingKeyMeansNotConfiguredAndNoRequest() throws Exception {
        try (Stub stub = new Stub(200, "{}")) {
            ClaudeMessagesClient client = client(stub, " ");

            assertFalse(client.configured());
            assertEquals(503, assertThrows(ApiException.class,
                () -> client.create(objectMapper.createObjectNode(), Duration.ofSeconds(2))).getStatus());
            assertTrue(stub.requests.isEmpty());
        }
    }

    private ClaudeMessagesClient client(Stub stub, String key) {
        return new ClaudeMessagesClient(objectMapper, HttpClient.newHttpClient(), stub.endpoint(), key, null);
    }

    /** Local JDK HTTP stub; no live Anthropic request is ever made. */
    private static final class Stub implements AutoCloseable {
        private final HttpServer server;
        private final List<Map<String, String>> requests = new CopyOnWriteArrayList<>();

        Stub(int status, String body) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                requests.add(Map.of(
                    "x-api-key", String.valueOf(exchange.getRequestHeaders().getFirst("x-api-key")),
                    "anthropic-version", String.valueOf(exchange.getRequestHeaders().getFirst("anthropic-version")),
                    "body", new String(exchange.getRequestBody().readAllBytes())));
                byte[] bytes = body.getBytes();
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
            });
            server.start();
        }

        URI endpoint() {
            return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1/messages");
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }
}
