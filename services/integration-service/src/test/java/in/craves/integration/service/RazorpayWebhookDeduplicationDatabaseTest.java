package in.craves.integration.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import in.craves.integration.config.OrderClientProperties;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.config.RazorpayProviderProperties;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.subscription.SubscriptionPaymentService;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** Signed calls through the real Spring transaction interceptor, PostgreSQL 16 and loopback Order HTTP. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class RazorpayWebhookDeduplicationDatabaseTest {
    private static final String PROVIDER_ORDER = "order_Dedup01";
    private static final String PAYMENT = "pay_Dedup01";
    private static final String WEBHOOK_SECRET = "LOCAL_FIXTURE_WEBHOOK_SECRET";
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final UUID paymentOrder = UUID.randomUUID(), checkout = UUID.randomUUID();
    private final List<JsonNode> paidNotifications = new CopyOnWriteArrayList<>();
    private final AtomicInteger callbackStatus = new AtomicInteger(200), callbackRequests = new AtomicInteger();
    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private PaymentService service;
    private HttpServer server;

    @BeforeEach
    void setUp() throws Exception {
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        var manager = new DataSourceTransactionManager(ds);
        tx = new TransactionTemplate(manager);
        assertEquals("chef_ledger_test", jdbc.queryForObject("SELECT current_database()", String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .locations("classpath:db/migration").load().migrate();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/payments/checkout/" + checkout + "/paid", exchange -> {
            callbackRequests.incrementAndGet();
            JsonNode body = json.readTree(exchange.getRequestBody());
            int status = callbackStatus.get();
            if (status == 200) paidNotifications.add(body);
            byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        var razorpay = new RazorpayPaymentClient(new RazorpayProviderProperties("SANDBOX", false, false,
            "rzp_test_fixture", "LOCAL_KEY_SECRET", WEBHOOK_SECRET, base, base + "/webhook", false), RestClient.builder());
        var cashfree = mock(PaymentProviderProperties.class);
        when(cashfree.baseUrl()).thenReturn(base);
        var target = new PaymentService(jdbc, json, cashfree, new PaymentRoutingProperties("RAZORPAY", false, true),
            razorpay, mock(SubscriptionPaymentService.class), new OrderClientProperties(base, base, "LOCAL_ORDER_FIXTURE"), RestClient.builder());
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        interceptor.afterPropertiesSet();
        var proxy = new ProxyFactory(target);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(interceptor);
        service = (PaymentService) proxy.getProxy();
        assertTrue(AopUtils.isAopProxy(service), "Every call must cross the actual Spring @Transactional proxy");
        seedOrder(paymentOrder, checkout, PROVIDER_ORDER);
    }

    @AfterEach
    void tearDown() { if (server != null) server.stop(0); }

    @ParameterizedTest
    @ValueSource(strings = {"captured", "failed", "authorized"})
    void exactSignedRedeliveryAcknowledgesWithoutRepeatingBusinessEffects(String status) {
        String raw = envelope(status).toString();
        deliver("same-event", raw);
        var original = row();
        assertDoesNotThrow(() -> deliver("same-event", raw));
        assertEquals(original, row());
        assertEvidence(1, 1);
        assertEquals(status, jdbc.queryForObject("SELECT payment_status FROM payment_schema.payment_attempt", String.class));
        assertEquals("captured".equals(status) ? 1 : 0, paidNotifications.size());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void fallbackIdentityIsPersistedOnBothProcessedAndDuplicateInbox(String eventId) {
        String raw = envelope("captured").toString();
        deliver(eventId, raw);
        deliver(eventId, raw);
        assertEvidence(1, 1);
        assertEquals(List.of(PAYMENT + ":payment.captured", PAYMENT + ":payment.captured"),
            jdbc.queryForList("SELECT event_identity FROM payment_schema.webhook_inbox", String.class));
        assertEquals(1, paidNotifications.size());
    }

    @Test
    void equivalentJsonWithDifferentWhitespaceAndKeyOrderIsStillADuplicate() throws Exception {
        ObjectNode payload = envelope("captured");
        deliver("same-event", payload.toString());
        ObjectNode reordered = json.createObjectNode();
        reordered.set("payload", payload.get("payload"));
        reordered.set("event", payload.get("event"));
        deliver("same-event", json.writerWithDefaultPrettyPrinter().writeValueAsString(reordered));
        assertEvidence(1, 1);
        assertEquals(1, paidNotifications.size());
    }

    @ParameterizedTest
    @ValueSource(strings = {"payment", "order", "event", "status", "amount", "currency", "metadata"})
    void reusedEventIdWithDifferentSignedPayloadIsRejected(String mutation) {
        ObjectNode original = envelope("failed");
        deliver("same-event", original.toString());
        ObjectNode changed = original.deepCopy();
        ObjectNode entity = (ObjectNode) changed.at("/payload/payment/entity");
        switch (mutation) {
            case "payment" -> entity.put("id", "pay_Other");
            case "order" -> {
                seedOrder(UUID.randomUUID(), UUID.randomUUID(), "order_Other");
                entity.put("order_id", "order_Other");
            }
            case "event" -> changed.put("event", "payment.authorized");
            case "status" -> entity.put("status", "captured");
            case "amount" -> entity.put("amount", 20000);
            case "currency" -> entity.put("currency", "USD");
            case "metadata" -> entity.put("description", "different signed provider evidence");
            default -> fail("Unknown mutation");
        }
        var before = row();
        var rejection = assertThrows(ResponseStatusException.class, () -> deliver("same-event", changed.toString()));
        assertEquals(HttpStatus.CONFLICT, rejection.getStatusCode());
        assertEquals("Razorpay event identity was reused with different payment evidence", rejection.getReason());
        assertEquals(before, row());
        assertEvidence(1, 0); // Failure and its inbox insert roll back with the proxied transaction.
        assertEquals(0, callbackRequests.get());
    }

    @ParameterizedTest
    @ValueSource(strings = {"payment_order_id", "event_type", "payment_status"})
    void duplicateMustMatchStoredBusinessColumnsAsWellAsPayload(String column) {
        String raw = envelope("failed").toString();
        deliver("same-event", raw);
        if (column.equals("payment_order_id")) {
            UUID other = UUID.randomUUID();
            seedOrder(other, UUID.randomUUID(), "order_Other");
            jdbc.update("UPDATE payment_schema.payment_event SET payment_order_id = ?", other);
        } else {
            jdbc.update("UPDATE payment_schema.payment_event SET " + column + " = 'different'");
        }
        var rejection = assertThrows(ResponseStatusException.class, () -> deliver("same-event", raw));
        assertEquals(HttpStatus.CONFLICT, rejection.getStatusCode());
        assertEvidence(1, 0);
    }

    @Test
    void invalidSignatureCannotUseAnExistingEventToBypassAuthentication() {
        String raw = envelope("captured").toString();
        deliver("same-event", raw);
        var before = row();
        var rejection = assertThrows(ResponseStatusException.class,
            () -> service.handleRazorpayWebhook("invalid", "same-event", raw));
        assertEquals(HttpStatus.UNAUTHORIZED, rejection.getStatusCode());
        assertEquals(before, row());
        assertEvidence(1, 0);
        assertEquals(1, paidNotifications.size());
    }

    @Test
    void wrongUnknownOrderCannotBeAcknowledgedAsAnExistingEvent() {
        ObjectNode payload = envelope("captured");
        deliver("same-event", payload.toString());
        ((ObjectNode) payload.at("/payload/payment/entity")).put("order_id", "order_Unknown");
        var rejection = assertThrows(ResponseStatusException.class, () -> deliver("same-event", payload.toString()));
        assertEquals(HttpStatus.NOT_FOUND, rejection.getStatusCode());
        assertEvidence(1, 0);
        assertEquals(1, paidNotifications.size());
    }

    @Test
    void incompletePayloadAndWrongCapturedMoneyRemainRejectedBeforeDedupe() {
        ObjectNode payload = envelope("captured");
        deliver("same-event", payload.toString());
        ObjectNode incomplete = payload.deepCopy();
        ((ObjectNode) incomplete.at("/payload/payment/entity")).remove("id");
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
            () -> deliver("same-event", incomplete.toString())).getStatusCode());
        ((ObjectNode) payload.at("/payload/payment/entity")).put("amount", 1);
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
            () -> deliver("same-event", payload.toString())).getStatusCode());
        assertEvidence(1, 0);
        assertEquals(1, paidNotifications.size());
    }

    @Test
    void concurrentSignedDuplicatesBothAcknowledgeAndCommitOnce() throws Exception {
        String raw = envelope("captured").toString();
        overlap(() -> deliver("same-event", raw), () -> deliver("same-event", raw), false);
        assertEvidence(1, 1);
        assertEquals(1, paidNotifications.size());
        assertEquals(1, callbackRequests.get());
        assertEquals("PAID", row().get("status"));
        assertEquals(PAYMENT, row().get("provider_payment_id"));
    }

    @Test
    void concurrentConflictingEventIdentityRejectsTheLoser() throws Exception {
        ObjectNode original = envelope("failed"), conflict = original.deepCopy();
        ((ObjectNode) conflict.at("/payload/payment/entity")).put("id", "pay_Conflicting");
        overlap(() -> deliver("same-event", original.toString()), () -> {
            var rejection = assertThrows(ResponseStatusException.class, () -> deliver("same-event", conflict.toString()));
            assertEquals(HttpStatus.CONFLICT, rejection.getStatusCode());
        }, false);
        assertEvidence(1, 0);
        assertEquals(PAYMENT, row().get("provider_payment_id"));
        assertEquals(0, callbackRequests.get());
    }

    @Test
    void waitingDeliveryProcessesWhenTheFirstTransactionRollsBack() throws Exception {
        String raw = envelope("failed").toString();
        overlap(() -> deliver("same-event", raw), () -> deliver("same-event", raw), true);
        assertEvidence(1, 0);
        assertEquals("failed", row().get("provider_status"));
        assertEquals(0, callbackRequests.get());
    }

    @Test
    void failedPaidCallbackRollsBackReceiptSoTheSignedEventCanBeRetried() {
        String raw = envelope("captured").toString();
        callbackStatus.set(503);
        assertThrows(ResponseStatusException.class, () -> deliver("same-event", raw));
        assertEvidence(0, 0);
        assertEquals("CREATED", row().get("status"));
        callbackStatus.set(200);
        deliver("same-event", raw);
        deliver("same-event", raw);
        assertEvidence(1, 1);
        assertEquals(1, paidNotifications.size());
        assertEquals(2, callbackRequests.get());
    }

    @Test
    void distinctCaptureEventsAndLateAttemptsPreserveTheFirstCapture() {
        String capture = envelope("captured").toString();
        deliver("capture-one", capture);
        var before = row();
        deliver("capture-two", capture);
        ObjectNode late = envelope("failed");
        ((ObjectNode) late.at("/payload/payment/entity")).put("id", "pay_FailedAttempt");
        deliver("failure", late.toString());
        deliver("failure", late.toString());
        assertEquals(before, row(), "OF03 capture identity and timestamp guard must survive dedupe");
        assertEvidence(3, 1);
        assertEquals(1, callbackRequests.get());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM payment_schema.payment_attempt WHERE provider_payment_id = 'pay_FailedAttempt'", Integer.class));
    }

    private void overlap(Runnable first, Runnable second, boolean rollBackFirst) throws Exception {
        var firstCompleted = new CountDownLatch(1);
        var releaseFirst = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var firstResult = pool.submit(() -> tx.executeWithoutResult(s -> {
                first.run();
                if (rollBackFirst) s.setRollbackOnly();
                firstCompleted.countDown();
                await(releaseFirst);
            }));
            try {
                assertTrue(firstCompleted.await(15, TimeUnit.SECONDS));
                var secondResult = pool.submit(second);
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
                boolean waiting = false;
                while (System.nanoTime() < deadline) {
                    waiting = Boolean.TRUE.equals(jdbc.queryForObject("""
                        SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
                          AND wait_event_type = 'Lock' AND query LIKE 'INSERT INTO payment_schema.payment_event%')
                        """, Boolean.class));
                    if (waiting) break;
                    Thread.sleep(10);
                }
                assertTrue(waiting, "Second proxied transaction must wait on the real unique event INSERT");
                System.out.println("OF06_PROVEN_POSTGRES_EVENT_INSERT_LOCK_OVERLAP rollback=" + rollBackFirst);
                releaseFirst.countDown();
                firstResult.get(15, TimeUnit.SECONDS);
                secondResult.get(15, TimeUnit.SECONDS);
            } finally { releaseFirst.countDown(); }
        }
    }

    private static void await(CountDownLatch latch) {
        try { assertTrue(latch.await(30, TimeUnit.SECONDS)); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
    }

    private void seedOrder(UUID id, UUID checkoutId, String providerOrder) {
        jdbc.update("""
            INSERT INTO payment_schema.payment_order
              (id, checkout_id, customer_identity_id, craves_payment_order_ref, amount, currency,
               status, provider, provider_order_id, provider_status, checkout_key_id)
            VALUES (?, ?, ?, ?, 100.00, 'INR', 'CREATED', 'RAZORPAY', ?, 'created', 'rzp_test_fixture')
            """, id, checkoutId, UUID.randomUUID(), "fixture/" + id, providerOrder);
    }

    private ObjectNode envelope(String status) {
        ObjectNode envelope = json.createObjectNode().put("event", "payment." + status);
        envelope.putObject("payload").putObject("payment").putObject("entity")
            .put("id", PAYMENT).put("entity", "payment").put("order_id", PROVIDER_ORDER)
            .put("status", status).put("amount", 10000).put("currency", "INR");
        return envelope;
    }

    private void deliver(String eventId, String raw) {
        service.handleRazorpayWebhook(hmac(raw), eventId, raw);
    }

    private static String hmac(String text) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(WEBHOOK_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) { throw new IllegalStateException(error); }
    }

    private Map<String, Object> row() {
        return jdbc.queryForMap("SELECT status, provider_status, provider_payment_id, updated_at FROM payment_schema.payment_order WHERE id = ?", paymentOrder);
    }

    private void assertEvidence(int events, int duplicates) {
        assertEquals(events, jdbc.queryForObject("SELECT count(*) FROM payment_schema.payment_event", Integer.class));
        assertEquals(events, jdbc.queryForObject("SELECT count(*) FROM payment_schema.payment_attempt", Integer.class));
        assertEquals(events + duplicates, jdbc.queryForObject("SELECT count(*) FROM payment_schema.webhook_inbox", Integer.class));
        assertEquals(events, jdbc.queryForObject("SELECT count(*) FROM payment_schema.webhook_inbox WHERE processing_status = 'PROCESSED' AND processed_at IS NOT NULL", Integer.class));
        assertEquals(duplicates, jdbc.queryForObject("SELECT count(*) FROM payment_schema.webhook_inbox WHERE processing_status = 'DUPLICATE' AND processed_at IS NOT NULL", Integer.class));
    }
}
