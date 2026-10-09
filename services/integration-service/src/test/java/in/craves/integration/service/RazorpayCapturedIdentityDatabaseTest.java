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
import in.craves.integration.finance.source.OrderFinancialFinalizationService;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.payout.ChefPayoutService;
import in.craves.integration.refund.RefundEventValidator;
import in.craves.integration.refund.RefundModels.EventEnvelope;
import in.craves.integration.refund.RefundModels.RefundRequestedData;
import in.craves.integration.refund.RefundRepository;
import in.craves.integration.refund.RefundRequestService;
import in.craves.integration.refund.RefundStatusEventFactory;
import in.craves.integration.subscription.SubscriptionPaymentService;
import in.craves.integration.web.PaymentDtos.VerifyPaymentRequest;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
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
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

/** Real PostgreSQL transactions and loopback provider/Order HTTP; no external payments. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class RazorpayCapturedIdentityDatabaseTest {
    private static final String PROVIDER_ORDER = "order_Identity01";
    private static final String CAPTURED = "pay_CapturedB";
    private static final String UNSUCCESSFUL = "pay_AttemptA";
    private static final String KEY_SECRET = "LOCAL_FIXTURE_KEY_SECRET";
    private static final String WEBHOOK_SECRET = "LOCAL_FIXTURE_WEBHOOK_SECRET";
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final UUID paymentOrder = UUID.randomUUID(), checkout = UUID.randomUUID(), customer = UUID.randomUUID();
    private final List<JsonNode> notifications = new CopyOnWriteArrayList<>();
    private final List<String> providerRequests = new CopyOnWriteArrayList<>();
    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private PaymentService service;
    private SubscriptionPaymentService subscriptions;
    private HttpServer server;
    private java.util.concurrent.ExecutorService httpThreads;

    @BeforeEach
    void setUp() throws Exception {
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"), "Explicit disposable fixture acknowledgement required");
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"), "Disposable local ledger fixture required");
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("chef_ledger_test", jdbc.queryForObject("SELECT current_database()", String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .locations("classpath:db/migration").load().migrate();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        httpThreads = Executors.newCachedThreadPool();
        server.setExecutor(httpThreads);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            String body;
            int status = 200;
            if (method.equals("GET") && path.equals("/checkout/" + checkout)) {
                body = json.writeValueAsString(Map.of("id", checkout, "customerIdentityId", customer,
                    "status", "PAYMENT_PENDING", "currency", "INR", "grandTotal", "100.00"));
            } else if (method.equals("GET") && path.equals("/v1/payments/" + CAPTURED)) {
                providerRequests.add(method + " " + path);
                body = payment(CAPTURED, "captured").toString();
            } else if (method.equals("POST") && path.equals("/payments/checkout/" + checkout + "/paid")) {
                notifications.add(json.readTree(exchange.getRequestBody()));
                body = "{}";
            } else {
                providerRequests.add("UNEXPECTED " + method + " " + path);
                status = 500;
                body = "{}";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        var razorpay = new RazorpayPaymentClient(new RazorpayProviderProperties("SANDBOX", false, false,
            "rzp_test_fixture", KEY_SECRET, WEBHOOK_SECRET, base, base + "/webhook", false), RestClient.builder());
        var cashfree = mock(PaymentProviderProperties.class);
        when(cashfree.baseUrl()).thenReturn(base);
        subscriptions = mock(SubscriptionPaymentService.class);
        service = new PaymentService(jdbc, json, cashfree, new PaymentRoutingProperties("RAZORPAY", false, true),
            razorpay, subscriptions, new OrderClientProperties(base, base, "LOCAL_ORDER_FIXTURE"), RestClient.builder());
        jdbc.update("""
            INSERT INTO payment_schema.payment_order
              (id, checkout_id, customer_identity_id, craves_payment_order_ref, amount, currency,
               status, provider, provider_order_id, provider_status, checkout_key_id)
            VALUES (?, ?, ?, ?, 100.00, 'INR', 'CREATED', 'RAZORPAY', ?, 'created', 'rzp_test_fixture')
            """, paymentOrder, checkout, customer, "fixture/" + paymentOrder, PROVIDER_ORDER);
    }

    @AfterEach
    void tearDown() {
        if (server != null) server.stop(0);
        if (httpThreads != null) httpThreads.shutdownNow();
    }

    @ParameterizedTest
    @ValueSource(strings = {"failed", "authorized"})
    void capturedPaymentSurvivesLateUnsuccessfulAttempt(String status) {
        webhook(CAPTURED, "captured", "captured-first");
        var capturedRow = row();
        webhook(UNSUCCESSFUL, status, "unsuccessful-late");
        assertEquals(capturedRow, row(), "A late attempt must not mutate any captured order evidence or timestamp");
        assertCaptured();
        assertEvidence(2);
        assertEquals(status, jdbc.queryForObject("SELECT payment_status FROM payment_schema.payment_attempt WHERE provider_payment_id = ?",
            String.class, UNSUCCESSFUL));
    }

    @ParameterizedTest
    @ValueSource(strings = {"failed", "authorized"})
    void unsuccessfulAttemptBeforeCaptureStillTransitionsAndNotifies(String status) {
        webhook(UNSUCCESSFUL, status, "unsuccessful-first");
        assertEquals("CREATED", row().get("status"));
        assertEquals(UNSUCCESSFUL, row().get("provider_payment_id"));
        assertEquals(status, row().get("provider_status"));
        assertEquals(0, notifications.size());
        webhook(CAPTURED, "captured", "captured-late");
        assertCaptured();
        assertEvidence(2);
    }

    @Test
    void repeatedCaptureDeliveriesAndVerificationPreserveTheFirstCapture() {
        webhook(CAPTURED, "captured", "capture-one");
        var capturedRow = row();
        webhook(CAPTURED, "captured", "capture-redelivery-new-event");
        verifyCaptured();
        assertEquals(capturedRow, row());
        assertCaptured();
        assertEvidence(2);
        assertEquals(List.of("GET /v1/payments/" + CAPTURED), providerRequests);
    }

    @Test
    void exactDuplicateAcknowledgesAndRetainsCapture() {
        webhook(CAPTURED, "captured", "same-event");
        var capturedRow = row();
        assertDoesNotThrow(() -> webhook(CAPTURED, "captured", "same-event"));
        assertEquals(capturedRow, row());
        assertCaptured();
        assertEquals(1, count("payment_event"));
        assertEquals(1, count("payment_attempt"));
        assertEquals(2, count("webhook_inbox"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM payment_schema.webhook_inbox WHERE processing_status = 'DUPLICATE'", Integer.class));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void failureWaitingOnUncommittedCaptureCannotOverwriteIt(boolean captureViaVerification) throws Exception {
        overlap(() -> {
            if (captureViaVerification) verifyCaptured(); else webhook(CAPTURED, "captured", "capture");
        }, () -> webhook(UNSUCCESSFUL, "failed", "failure"));
        assertCaptured();
        assertEvidence(captureViaVerification ? 1 : 2);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void captureWaitingOnUncommittedFailureStillWins(boolean captureViaVerification) throws Exception {
        overlap(() -> webhook(UNSUCCESSFUL, "failed", "failure"), () -> {
            if (captureViaVerification) verifyCaptured(); else webhook(CAPTURED, "captured", "capture");
        });
        assertCaptured();
        assertEvidence(captureViaVerification ? 1 : 2);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void verificationOverlappingCaptureWebhookNotifiesOnlyOnce(boolean verificationFirst) throws Exception {
        Runnable capture = () -> webhook(CAPTURED, "captured", "capture");
        overlap(verificationFirst ? this::verifyCaptured : capture, verificationFirst ? capture : this::verifyCaptured);
        assertCaptured();
        assertEvidence(1);
    }

    @Test
    void preventionDoesNotRewriteHistoricallyCorruptedPaidRows() {
        jdbc.update("UPDATE payment_schema.payment_order SET status = 'PAID', provider_status = 'failed', provider_payment_id = ? WHERE id = ?",
            UNSUCCESSFUL, paymentOrder);
        var historical = row();
        webhook(CAPTURED, "captured", "capture-replay");
        verifyCaptured();
        assertEquals(historical, row(), "Historical reconciliation remains outside this prevention-only fix");
        assertEquals(0, notifications.size());
        assertEvidence(1);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void refundPreparationAndFinancialRecognitionKeepCapturedB(boolean prepareBeforeLateAttempt) throws Exception {
        webhook(CAPTURED, "captured", "capture");
        UUID financeOrder = seedBoundFinancialCaptureFixture();
        var payouts = mock(ChefPayoutService.class);
        var finalizer = new OrderFinancialFinalizationService(jdbc, json, new LedgerPostingService(jdbc, json, true), payouts, true);
        if (prepareBeforeLateAttempt) {
            prepareRefund();
            assertEquals("CAPTURED_AWAITING_DELIVERY", tx.execute(s -> finalizer.finish(financeOrder)).result());
        }
        webhook(UNSUCCESSFUL, "failed", "late-failure");
        if (!prepareBeforeLateAttempt) prepareRefund();
        assertEquals(CAPTURED, jdbc.queryForObject("SELECT provider_payment_id FROM payment_schema.refund", String.class));
        assertEquals("CAPTURED_AWAITING_DELIVERY", tx.execute(s -> finalizer.finish(financeOrder)).result());
        assertEquals(CAPTURED, jdbc.queryForObject("SELECT provider_payment_id FROM payment_schema.finance_capture", String.class));
        assertEquals("razorpay/" + CAPTURED, jdbc.queryForObject("SELECT evidence_reference FROM payment_schema.ledger_transaction", String.class));
        assertEquals(1, count("finance_capture"));
        assertEquals(1, count("ledger_transaction"));
        assertEquals(0, count("finance_earning_projection"));
        assertEquals(0, count("finance_payable"));
        verifyNoInteractions(payouts);
        var refunds = new RefundRepository(jdbc, new RefundStatusEventFactory(json));
        assertFalse(refunds.hasUnknownHistoricalExposure("SANDBOX"));
        var claimed = tx.execute(s -> refunds.claimBatch(true, false, 10, 3, 60, UUID.randomUUID(), "RAZORPAY", "SANDBOX"));
        assertEquals(1, claimed.size());
        assertEquals(CAPTURED, claimed.getFirst().providerPaymentId());
        assertEquals("CREATE", claimed.getFirst().workKind());
        assertTrue(providerRequests.isEmpty(), "No refund or provider execution is performed");
        assertCaptured();
    }

    @Test
    void subscriptionWebhookStillBranchesBeforeOrdinaryPaymentProjection() {
        when(subscriptions.handlesRazorpayOrder(PROVIDER_ORDER)).thenReturn(true);
        var original = row();
        webhook(UNSUCCESSFUL, "failed", "subscription-fixture");
        verify(subscriptions).applyRazorpayWebhook(payment(UNSUCCESSFUL, "failed"), "payment.failed");
        assertEquals(original, row());
        assertEquals(0, count("payment_event"));
        assertEquals(0, count("payment_attempt"));
        assertEquals(0, notifications.size());
    }

    private void overlap(Runnable first, Runnable second) throws Exception {
        var firstUpdated = new CountDownLatch(1);
        var releaseFirst = new CountDownLatch(1);
        var secondPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var firstResult = pool.submit(() -> tx.executeWithoutResult(s -> {
                first.run();
                firstUpdated.countDown();
                await(releaseFirst);
            }));
            try {
                assertTrue(firstUpdated.await(15, TimeUnit.SECONDS), "First transaction must reach its real UPDATE");
                var secondResult = pool.submit(() -> tx.executeWithoutResult(s -> {
                    secondPid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                    second.run();
                }));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
                boolean waiting = false;
                while (System.nanoTime() < deadline) {
                    waiting = Boolean.TRUE.equals(jdbc.queryForObject("""
                        SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid = ?
                          AND wait_event_type = 'Lock' AND query LIKE 'UPDATE payment_schema.payment_order%')
                        """, Boolean.class, secondPid.get()));
                    if (waiting) break;
                    Thread.sleep(10);
                }
                assertTrue(waiting, "Second transaction must demonstrably wait on the real payment-order UPDATE");
                System.out.println("OF03_PROVEN_POSTGRES_UPDATE_LOCK_OVERLAP pid=" + secondPid.get());
                releaseFirst.countDown();
                firstResult.get(15, TimeUnit.SECONDS);
                secondResult.get(15, TimeUnit.SECONDS);
            } finally {
                releaseFirst.countDown();
            }
        }
    }

    private static void await(CountDownLatch latch) {
        try { assertTrue(latch.await(30, TimeUnit.SECONDS)); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
    }

    private ObjectNode payment(String id, String status) {
        return json.createObjectNode().put("id", id).put("entity", "payment").put("order_id", PROVIDER_ORDER)
            .put("status", status).put("amount", 10000).put("currency", "INR");
    }

    private void webhook(String paymentId, String status, String eventId) {
        ObjectNode envelope = json.createObjectNode().put("event", "payment." + status);
        envelope.putObject("payload").putObject("payment").set("entity", payment(paymentId, status));
        String raw = envelope.toString();
        tx.executeWithoutResult(s -> service.handleRazorpayWebhook(hmac(raw, WEBHOOK_SECRET), eventId, raw));
    }

    private void verifyCaptured() {
        var request = new VerifyPaymentRequest(PROVIDER_ORDER, CAPTURED, hmac(PROVIDER_ORDER + "|" + CAPTURED, KEY_SECRET));
        var verified = tx.execute(s -> service.verifyPayment("Bearer LOCAL_FIXTURE", paymentOrder, request));
        assertEquals(CAPTURED, verified.providerPaymentId());
    }

    private static String hmac(String text, String key) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) { throw new IllegalStateException(error); }
    }

    private Map<String, Object> row() {
        return jdbc.queryForMap("SELECT status, provider_status, provider_payment_id, updated_at FROM payment_schema.payment_order WHERE id = ?", paymentOrder);
    }

    private void assertCaptured() {
        assertEquals("PAID", row().get("status"));
        assertEquals("captured", row().get("provider_status"));
        assertEquals(CAPTURED, row().get("provider_payment_id"));
        assertEquals(1, notifications.size());
        assertEquals(CAPTURED, notifications.getFirst().path("providerPaymentId").asText());
        assertEquals(PROVIDER_ORDER, notifications.getFirst().path("providerOrderId").asText());
        assertEquals(paymentOrder.toString(), notifications.getFirst().path("paymentOrderId").asText());
    }

    private void assertEvidence(int attempts) {
        assertEquals(attempts, count("payment_event"));
        assertEquals(attempts, count("payment_attempt"));
        assertEquals(attempts, count("webhook_inbox"));
        assertEquals(attempts, jdbc.queryForObject("SELECT count(*) FROM payment_schema.webhook_inbox WHERE processing_status = 'PROCESSED'", Integer.class));
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM payment_schema." + table, Integer.class);
    }

    private void prepareRefund() throws Exception {
        UUID order = UUID.randomUUID();
        var data = new RefundRequestedData(checkout, order, customer, new BigDecimal("25.00"), "INR", "CHEF_DECLINED", Instant.now());
        var event = new EventEnvelope<>(UUID.randomUUID(), "REFUND_REQUESTED", "1.0", Instant.now(), checkout,
            UUID.randomUUID(), "order-service", order.toString(), data);
        String raw = json.writeValueAsString(event);
        var refunds = new RefundRequestService(jdbc, new RefundEventValidator());
        assertEquals(Boolean.TRUE, tx.execute(s -> refunds.accept(event, raw)));
    }

    private UUID seedBoundFinancialCaptureFixture() {
        // Only the existing capture-recognition path is exercised; no delivery, chef action, or payout.
        UUID order = UUID.randomUUID(), chef = UUID.randomUUID(), snapshot = UUID.randomUUID();
        String payload = json.createObjectNode().put("chefIdentityId", chef.toString()).put("checkoutId", checkout.toString())
            .put("customerIdentityId", customer.toString()).toString();
        jdbc.update("INSERT INTO payment_schema.finance_issued_snapshot(id,checkout_id,chef_order_id,chef_identity_id,snapshot_hash,payload) VALUES (?,?,?,?,?,?::jsonb)",
            snapshot, checkout, order, chef, "a".repeat(64), payload);
        jdbc.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,?::jsonb)",
            checkout, customer, "b".repeat(64), "{\"total\":\"100.00\"}");
        jdbc.update("INSERT INTO payment_schema.finance_order_binding(chef_order_id,snapshot_id,state,source_version) VALUES (?,?,'BOUND',1)", order, snapshot);
        return order;
    }
}
