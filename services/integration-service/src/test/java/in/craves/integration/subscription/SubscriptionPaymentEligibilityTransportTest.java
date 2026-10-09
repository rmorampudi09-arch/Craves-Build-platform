package in.craves.integration.subscription;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.subscription.SubscriptionPaymentModels.CreateSubscriptionPaymentOrderRequest;
import in.craves.integration.subscription.SubscriptionPaymentRepository.PaymentIntent;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** Exercises the production HTTP transport only against disposable loopback servers. */
class SubscriptionPaymentEligibilityTransportTest {
    private static final UUID INVOICE = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID SUBSCRIPTION = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID CUSTOMER = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final String AUTH = "Bearer local-transport-fixture";
    private static final String PATH = "/api/v1/subscriptions/" + SUBSCRIPTION;
    private final List<HttpServer> servers = new ArrayList<>();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final SubscriptionPaymentRepository repository = mock(SubscriptionPaymentRepository.class);
    private final RazorpayPaymentClient razorpay = mock(RazorpayPaymentClient.class);

    @AfterEach
    void stopServers() {
        servers.forEach(server -> server.stop(0));
        executor.shutdownNow();
    }

    @Test
    void redirectedEligibilityCannotForwardBearerOrTreatOtherServerNoContentAsPermission() throws Exception {
        AtomicInteger redirectedRequests = new AtomicInteger();
        AtomicReference<String> leakedAuthorization = new AtomicReference<>();
        HttpServer destination = server();
        destination.createContext("/", exchange -> {
            redirectedRequests.incrementAndGet();
            leakedAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        destination.start();

        AtomicInteger eligibilityRequests = new AtomicInteger();
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> query = new AtomicReference<>();
        HttpServer source = server();
        source.createContext(PATH, exchange -> {
            if (exchange.getRequestURI().getPath().equals(PATH)) {
                exchange.sendResponseHeaders(200, -1);
            } else {
                eligibilityRequests.incrementAndGet();
                authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
                query.set(exchange.getRequestURI().getRawQuery());
                exchange.getResponseHeaders().set("Location", url(destination) + "/elsewhere");
                exchange.sendResponseHeaders(302, -1);
            }
            exchange.close();
        });
        source.start();
        SubscriptionPaymentService service = service(url(source));

        ResponseStatusException failure = assertThrows(ResponseStatusException.class, () -> createOrder(service));

        assertEquals(HttpStatus.BAD_GATEWAY, failure.getStatusCode());
        assertEquals(1, eligibilityRequests.get());
        assertEquals(AUTH, authorization.get());
        assertEquals("expectedCustomerIdentityId=" + CUSTOMER, query.get());
        assertEquals(0, redirectedRequests.get());
        assertNull(leakedAuthorization.get());
        noPaymentSideEffects();
    }

    @Test
    void stalledEligibilityResponseHasBoundedReadTimeoutAndNoPaymentSideEffects() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger eligibilityRequests = new AtomicInteger();
        HttpServer source = server();
        source.createContext(PATH, exchange -> {
            try {
                if (exchange.getRequestURI().getPath().equals(PATH)) {
                    exchange.sendResponseHeaders(200, -1);
                } else {
                    eligibilityRequests.incrementAndGet();
                    release.await();
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        source.start();
        SubscriptionPaymentService service = service(url(source));

        try {
            assertTimeoutPreemptively(Duration.ofSeconds(9), () -> {
                ResponseStatusException failure = assertThrows(ResponseStatusException.class, () -> createOrder(service));
                assertEquals(HttpStatus.SERVICE_UNAVAILABLE, failure.getStatusCode());
            });
            assertEquals(1, eligibilityRequests.get());
            noPaymentSideEffects();
        } finally {
            release.countDown();
        }
    }

    @Test
    void stalledPartialErrorBodyHasBoundedReadTimeoutAndNoPaymentSideEffects() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger eligibilityRequests = new AtomicInteger();
        HttpServer source = server();
        source.createContext(PATH, exchange -> {
            try {
                if (exchange.getRequestURI().getPath().equals(PATH)) {
                    exchange.sendResponseHeaders(200, -1);
                } else {
                    eligibilityRequests.incrementAndGet();
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(503, 1000);
                    exchange.getResponseBody().write("{\"error\":".getBytes(StandardCharsets.UTF_8));
                    exchange.getResponseBody().flush();
                    release.await();
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        source.start();
        SubscriptionPaymentService service = service(url(source));

        try {
            assertTimeoutPreemptively(Duration.ofSeconds(9), () -> {
                ResponseStatusException failure = assertThrows(ResponseStatusException.class, () -> createOrder(service));
                assertEquals(HttpStatus.SERVICE_UNAVAILABLE, failure.getStatusCode());
            });
            assertEquals(1, eligibilityRequests.get());
            noPaymentSideEffects();
        } finally {
            release.countDown();
        }
    }

    private HttpServer server() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(executor);
        servers.add(server);
        return server;
    }

    private static String url(HttpServer server) {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private SubscriptionPaymentService service(String baseUrl) {
        var settings = new SubscriptionPaymentProperties();
        settings.setSubscriptionServiceBaseUrl(baseUrl);
        var cashfree = new PaymentProviderProperties("sandbox", false, false, "2025-01-01",
            "fixture-client", "fixture-secret", "https://unused-cashfree.test", "https://unused-production.test",
            "https://craves.test/return", "https://craves.test/webhook", "", 300, "2025-01-01");
        Instant now = Instant.now();
        PaymentIntent intent = new PaymentIntent(UUID.randomUUID(), INVOICE, SUBSCRIPTION, UUID.randomUUID(),
            CUSTOMER, null, LocalDate.of(2026, 8, 12), LocalDate.of(2026, 9, 12), new BigDecimal("1499.00"),
            "INR", "PAYMENT_REQUESTED", null, null, null, null, now, now, null);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(intent));
        return new SubscriptionPaymentService(repository, settings, cashfree,
            new PaymentRoutingProperties("RAZORPAY", true, false), razorpay,
            new ObjectMapper().findAndRegisterModules(), RestClient.builder());
    }

    private void createOrder(SubscriptionPaymentService service) {
        service.createProviderOrder(AUTH, INVOICE,
            new CreateSubscriptionPaymentOrderRequest("Fixture", "9876543210", null, "https://craves.test/return"),
            new CravesPrincipal(CUSTOMER, "", Set.of("CUSTOMER")));
    }

    private void noPaymentSideEffects() {
        verify(repository).findByInvoice(INVOICE);
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(razorpay);
    }
}
