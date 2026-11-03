package in.craves.advanced.platform.clients;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.advanced.platform.AdvancedSettings;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The real gateway against a local stand-in for api.craves.in. */
class HttpAccountDataGatewayTest {
    HttpServer server;
    HttpAccountDataGateway gateway;
    final AtomicReference<String> auth = new AtomicReference<>();

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/json", exchange -> {
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            reply(exchange, 200, "{\"firstName\":\"Asha\"}");
        });
        server.createContext("/expired", exchange -> reply(exchange, 401, "{\"code\":\"UNAUTHORIZED\"}"));
        server.createContext("/html", exchange -> reply(exchange, 502, "<html>Bad gateway</html>"));
        server.createContext("/moved", exchange -> {
            exchange.getResponseHeaders().add("Location", "https://elsewhere.example/steal");
            reply(exchange, 302, "");
        });
        server.createContext("/stall", exchange -> {
            exchange.sendResponseHeaders(200, 0); // headers at once, then the body never comes
            exchange.getResponseBody().flush();
            try {
                Thread.sleep(20_000);
            } catch (InterruptedException ignored) {
                // stopped
            }
            exchange.close();
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        AdvancedSettings settings = new AdvancedSettings(null, null, null, false, null, "http://127.0.0.1:" + server.getAddress().getPort(), null, 0);
        gateway = new HttpAccountDataGateway(new ObjectMapper(), settings);
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    static void reply(com.sun.net.httpserver.HttpExchange exchange, int status, String body) throws java.io.IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Test
    void passesTheCallersTokenAndTheServicesAnswer() {
        var answer = gateway.read("token-1", "/json");
        assertThat(answer.status()).isEqualTo(200);
        assertThat(answer.body().path("firstName").asText()).isEqualTo("Asha");
        assertThat(auth.get()).isEqualTo("Bearer token-1");
        assertThat(gateway.read("token-1", "/expired").status()).isEqualTo(401);
    }

    @Test
    void unreadableAnswersRedirectsAndStalledBodiesNeverHang() {
        assertThat(gateway.read("t", "/html").status()).isZero();
        assertThat(gateway.read("t", "/moved").status()).isEqualTo(302);
        long started = System.nanoTime();
        assertThat(gateway.read("t", "/stall").status()).isZero();
        assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(8_000);
    }
}
