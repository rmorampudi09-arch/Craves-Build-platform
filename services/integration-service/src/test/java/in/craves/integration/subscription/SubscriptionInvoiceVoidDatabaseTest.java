package in.craves.integration.subscription;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.payment.RazorpayPaymentClient;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

/** SUBSCRIPTION_INVOICE_VOIDED against the real payment_schema migrations on disposable PostgreSQL. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class SubscriptionInvoiceVoidDatabaseTest {
    private final UUID subscription = UUID.randomUUID(), plan = UUID.randomUUID(), customer = UUID.randomUUID();
    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private SubscriptionPaymentRepository repository;
    private SubscriptionPaymentService service;

    @BeforeEach void setUp() {
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("chef_ledger_test", jdbc.queryForObject("SELECT current_database()", String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .locations("classpath:db/migration").load().migrate();
        repository = new SubscriptionPaymentRepository(jdbc);
        var cashfree = new PaymentProviderProperties("sandbox", false, false, "2025-01-01",
            "fixture-client", "fixture-secret", "https://sandbox.cashfree.com", "https://api.cashfree.com",
            "https://craves.test/return", "https://craves.test/webhook", "", 300, "2025-01-01");
        service = new SubscriptionPaymentService(repository, new SubscriptionPaymentProperties(), cashfree,
            new PaymentRoutingProperties("RAZORPAY", true, false), mock(RazorpayPaymentClient.class),
            new ObjectMapper().findAndRegisterModules(), RestClient.builder());
    }

    private boolean requested(UUID invoice, String cycleStart, String cycleEnd) {
        return service.acceptRequested("{\"eventId\":\"" + UUID.randomUUID() + "\",\"eventType\":\"SUBSCRIPTION_PAYMENT_REQUESTED\","
            + "\"eventVersion\":\"v1\",\"occurredAt\":\"2026-10-12T06:30:00Z\",\"correlationId\":\"" + invoice + "\","
            + "\"causationId\":\"" + subscription + "\",\"subject\":\"" + invoice + "\",\"data\":{\"invoiceId\":\"" + invoice + "\","
            + "\"subscriptionId\":\"" + subscription + "\",\"planId\":\"" + plan + "\",\"customerIdentityId\":\"" + customer + "\","
            + "\"cycleStart\":\"" + cycleStart + "\",\"cycleEnd\":\"" + cycleEnd + "\",\"amount\":1499.00,\"currency\":\"INR\"}}");
    }
    /** Exactly what subscription-service writes to its outbox when a resume voids the bill. */
    private String voided(UUID eventId, UUID invoice) {
        return "{\"eventId\":\"" + eventId + "\",\"eventType\":\"SUBSCRIPTION_INVOICE_VOIDED\",\"eventVersion\":\"v1\","
            + "\"occurredAt\":\"2026-10-12T06:30:00.123456Z\",\"correlationId\":\"" + invoice + "\",\"causationId\":\"" + subscription + "\","
            + "\"subject\":\"" + invoice + "\",\"data\":{\"invoiceId\":\"" + invoice + "\",\"subscriptionId\":\"" + subscription + "\","
            + "\"reason\":\"PAUSED_CYCLE_VOIDED\"}}";
    }
    private Map<String, Object> intent(UUID invoice) {
        return jdbc.queryForMap("SELECT status, last_error FROM payment_schema.subscription_payment_intent WHERE invoice_id = ?", invoice);
    }
    private int statusEvents() {
        return jdbc.queryForObject("SELECT count(*) FROM payment_schema.subscription_payment_status_outbox", Integer.class);
    }

    @Test void voidedUnpaidBillIsCancelledAndLatestFallsBackToTheLastStandingBill() {
        UUID paid = UUID.randomUUID(), open = UUID.randomUUID();
        assertTrue(requested(paid, "2026-10-05", "2026-10-12"));
        assertTrue(requested(open, "2026-10-12", "2026-10-19"));
        jdbc.update("UPDATE payment_schema.subscription_payment_intent SET status = 'PAID', paid_at = now() WHERE invoice_id = ?", paid);

        assertTrue(service.acceptRequested(voided(UUID.randomUUID(), open)));

        assertEquals(Map.of("status", "CANCELLED", "last_error", "PAUSED_CYCLE_VOIDED"), intent(open));
        assertEquals(paid, repository.findLatestBySubscription(subscription).orElseThrow().invoiceId());
        jdbc.update("DELETE FROM payment_schema.subscription_payment_intent WHERE invoice_id = ?", paid);
        assertTrue(repository.findLatestBySubscription(subscription).isEmpty(), "Only a voided bill left means no bill to pay yet");
    }

    @Test void voidArrivingBeforeTheRequestStillTakesEffect() {
        UUID invoice = UUID.randomUUID();
        assertFalse(service.acceptRequested(voided(UUID.randomUUID(), invoice)));
        assertEquals(List.of("SUBSCRIPTION_INVOICE_VOIDED:PROCESSED"), jdbc.queryForList(
            "SELECT event_type || ':' || processing_status FROM payment_schema.subscription_payment_request_inbox WHERE subject = ?", String.class, invoice));

        requested(invoice, "2026-10-12", "2026-10-19");

        assertEquals(Map.of("status", "CANCELLED", "last_error", "PAUSED_CYCLE_VOIDED"), intent(invoice));
        assertTrue(repository.findLatestBySubscription(subscription).isEmpty());
    }

    @Test void voidProcessedWhileItsRequestIsStillUncommittedIsNotLost() throws Exception {
        UUID invoice = UUID.randomUUID();
        var voidCall = new Thread(() -> tx.executeWithoutResult(s -> service.acceptRequested(voided(UUID.randomUUID(), invoice))));
        tx.executeWithoutResult(s -> {
            requested(invoice, "2026-10-12", "2026-10-19");
            voidCall.start();
            try {
                voidCall.join(1500); // the void waits for this request's transaction
            } catch (InterruptedException e) {
                throw new IllegalStateException(e);
            }
        });
        voidCall.join(10_000);
        assertEquals("CANCELLED", intent(invoice).get("status"));
    }

    @Test void paidBillStaysPaid() {
        UUID invoice = UUID.randomUUID();
        requested(invoice, "2026-10-12", "2026-10-19");
        jdbc.update("UPDATE payment_schema.subscription_payment_intent SET status = 'PAID', paid_at = now() WHERE invoice_id = ?", invoice);

        assertFalse(service.acceptRequested(voided(UUID.randomUUID(), invoice)));

        Map<String, Object> row = intent(invoice);
        assertEquals("PAID", row.get("status"));
        assertNull(row.get("last_error"));
        assertEquals(0, statusEvents());
    }

    @Test void redeliveredVoidIsRecordedOnce() {
        UUID eventId = UUID.randomUUID(), unknownInvoice = UUID.randomUUID();
        assertFalse(service.acceptRequested(voided(eventId, unknownInvoice)));
        assertFalse(service.acceptRequested(voided(eventId, unknownInvoice)));
        assertEquals(1, jdbc.queryForObject(
            "SELECT count(*) FROM payment_schema.subscription_payment_request_inbox WHERE event_id = ?", Integer.class, eventId));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM payment_schema.subscription_payment_intent", Integer.class));
    }

    @Test void failureCannotReopenAVoidedBillButALateCaptureIsRecordedAndPublished() {
        UUID invoice = UUID.randomUUID();
        requested(invoice, "2026-10-12", "2026-10-19");
        var pending = repository.storeRazorpayOrder(repository.findByInvoice(invoice).orElseThrow().id(), "order_Late01", "rzp_test_fixture", "created");
        assertEquals("PAYMENT_PENDING", pending.status());
        assertTrue(service.acceptRequested(voided(UUID.randomUUID(), invoice)));
        var json = new ObjectMapper();

        service.applyRazorpayWebhook(json.createObjectNode().put("id", "pay_Failed01").put("order_id", "order_Late01")
            .put("status", "failed").put("amount", 149900).put("currency", "INR"), "payment.failed");
        assertEquals("CANCELLED", intent(invoice).get("status"));
        assertEquals(0, statusEvents());
        var reordered = repository.storeRazorpayOrder(pending.id(), "order_Second01", "rzp_test_fixture", "created");
        assertEquals(List.of("CANCELLED", "order_Late01"), List.of(reordered.status(), reordered.providerOrderId()));

        service.applyRazorpayWebhook(json.createObjectNode().put("id", "pay_Late01").put("order_id", "order_Late01")
            .put("status", "captured").put("amount", 149900).put("currency", "INR"), "payment.captured");
        assertEquals("PAID", intent(invoice).get("status"));
        assertEquals(List.of("SUBSCRIPTION_PAYMENT_STATUS_CHANGED:PAID"), jdbc.queryForList(
            "SELECT event_type || ':' || (payload -> 'data' ->> 'status') FROM payment_schema.subscription_payment_status_outbox", String.class));
    }
}
