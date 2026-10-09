package in.craves.subscription.address;

import com.sun.net.httpserver.HttpServer;
import in.craves.subscription.exception.ApiException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;

class SubscriptionDeliveryAddressTransportTest {
    @Test void redirectCannotForwardInternalSecretOrAuthorizeAnAddress() throws Exception {
        var targetCalls = new AtomicInteger();
        var originCalls = new AtomicInteger();
        var target = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var origin = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        target.createContext("/", exchange -> {
            targetCalls.incrementAndGet();
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        origin.createContext("/internal/v1/customer-addresses", exchange -> {
            originCalls.incrementAndGet();
            assertEquals(SubscriptionDeliveryAddressClientTest.SECRET, exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));
            byte[] validBody = SubscriptionDeliveryAddressClientTest.validAddress().toString().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Location", "http://127.0.0.1:" + target.getAddress().getPort() + "/redirect-target");
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(302, validBody.length);
            exchange.getResponseBody().write(validBody);
            exchange.close();
        });
        target.start(); origin.start();
        try {
            var client = new SubscriptionDeliveryAddressClient("http://127.0.0.1:" + origin.getAddress().getPort(),
                SubscriptionDeliveryAddressClientTest.SECRET, RestClient.builder());
            ApiException error = assertThrows(ApiException.class, () -> client.requireEligible(
                SubscriptionDeliveryAddressClientTest.CUSTOMER, SubscriptionDeliveryAddressClientTest.ADDRESS));
            assertEquals(503, error.getStatus());
            assertEquals(1, originCalls.get());
            assertEquals(0, targetCalls.get(), "No redirect request may leave the configured origin");
        } finally { origin.stop(0); target.stop(0); }
    }

    @Test void unresponsiveUpstreamHasABoundedReadTimeout() throws Exception { assertStalledResponseIsBounded(false); }

    @Test void headersThenStalledJsonBodyHasABoundedReadTimeout() throws Exception { assertStalledResponseIsBounded(true); }

    private void assertStalledResponseIsBounded(boolean partialBody) throws Exception {
        var origin = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        origin.setExecutor(executor);
        origin.createContext("/", exchange -> {
            if (partialBody) {
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, 0);
                exchange.getResponseBody().write("{\"id\":".getBytes(StandardCharsets.UTF_8));
                exchange.getResponseBody().flush();
            }
            try { Thread.sleep(20000); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            exchange.close();
        });
        origin.start();
        try {
            var client = new SubscriptionDeliveryAddressClient("http://127.0.0.1:" + origin.getAddress().getPort(),
                SubscriptionDeliveryAddressClientTest.SECRET, RestClient.builder());
            assertTimeoutPreemptively(Duration.ofSeconds(12), () -> {
                ApiException error = assertThrows(ApiException.class, () -> client.requireEligible(
                    SubscriptionDeliveryAddressClientTest.CUSTOMER, SubscriptionDeliveryAddressClientTest.ADDRESS));
                assertEquals(503, error.getStatus());
                assertEquals("DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE", error.getCode());
            });
        } finally { origin.stop(0); executor.shutdownNow(); }
    }
}
