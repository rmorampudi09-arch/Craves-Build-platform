package in.craves.integration.subscription;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PaymentApiProperties;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.subscription.SubscriptionPaymentModels.EventEnvelope;
import in.craves.integration.subscription.SubscriptionPaymentModels.InvoiceVoidedData;
import in.craves.integration.subscription.SubscriptionPaymentModels.VerifySubscriptionPaymentRequest;
import in.craves.integration.subscription.SubscriptionPaymentRepository.PaymentIntent;
import in.craves.integration.web.SubscriptionPaymentController;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** A bill voided when a paused plan was resumed can never be paid again, but money already taken is never dropped. */
class SubscriptionInvoiceVoidTest {
    private static final UUID INVOICE = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID SUBSCRIPTION = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final String AUTH = "Bearer isolated-customer-fixture";
    private static final String ORDER = "order_Voided01";
    private static final String KEY = "rzp_test_fixture";
    private static final BigDecimal AMOUNT = new BigDecimal("1499.00");
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private SubscriptionPaymentRepository repository;
    private RazorpayPaymentClient provider;
    private SubscriptionPaymentService service;
    private MockRestServiceServer server;

    @BeforeEach void setUp() {
        repository = mock(SubscriptionPaymentRepository.class);
        provider = mock(RazorpayPaymentClient.class);
        var settings = new SubscriptionPaymentProperties();
        settings.setSubscriptionServiceBaseUrl("https://subscription.test");
        var cashfree = new PaymentProviderProperties("sandbox", false, false, "2025-01-01",
            "fixture-client", "fixture-secret", "https://sandbox.cashfree.com", "https://api.cashfree.com",
            "https://craves.test/return", "https://craves.test/webhook", "", 300, "2025-01-01");
        var builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        service = new SubscriptionPaymentService(repository, settings, cashfree,
            new PaymentRoutingProperties("RAZORPAY", true, false), provider, json, builder);
        when(repository.response(any(PaymentIntent.class))).thenAnswer(invocation ->
            new SubscriptionPaymentRepository(null).response(invocation.getArgument(0)));
    }

    private PaymentIntent intent(String status, String order) {
        Instant at = Instant.parse("2026-08-12T06:30:00Z"); // older than the catch-up quiet period
        return new PaymentIntent(UUID.fromString("22222222-2222-4222-8222-222222222222"), INVOICE,
            SUBSCRIPTION, UUID.fromString("44444444-4444-4444-8444-444444444444"),
            UUID.fromString("55555555-5555-4555-8555-555555555555"), null,
            LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 19), AMOUNT, "INR", status,
            null, null, null, null, at, at, "PAID".equals(status) ? at : null, "RAZORPAY", order, null,
            order == null ? null : KEY);
    }
    private void owner(int count) {
        server.expect(ExpectedCount.times(count), requestTo("https://subscription.test/api/v1/subscriptions/" + SUBSCRIPTION))
            .andExpect(method(HttpMethod.GET)).andExpect(header("Authorization", AUTH)).andRespond(withSuccess());
    }
    private String voided(String eventType, UUID invoiceId) {
        return "{\"eventId\":\"" + UUID.randomUUID() + "\",\"eventType\":\"" + eventType + "\",\"eventVersion\":\"v1\","
            + "\"occurredAt\":\"2026-10-12T06:30:00Z\",\"correlationId\":\"" + INVOICE + "\",\"causationId\":\"" + SUBSCRIPTION + "\","
            + "\"subject\":\"" + INVOICE + "\",\"data\":{\"invoiceId\":" + (invoiceId == null ? "null" : "\"" + invoiceId + "\"")
            + ",\"subscriptionId\":\"" + SUBSCRIPTION + "\",\"reason\":\"PAUSED_CYCLE_VOIDED\"}}";
    }

    @Test void voidedBillNeverGetsAProviderOrder() {
        owner(1);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(intent("CANCELLED", null)));
        var error = assertThrows(ResponseStatusException.class, () -> service.createProviderOrder(AUTH, INVOICE, null));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertEquals("This bill was cancelled when the plan was resumed", error.getReason());
        verifyNoInteractions(provider);
        verify(repository, never()).storeRazorpayOrder(any(), any(), any(), any());
        server.verify();
    }

    @Test void voidedBillIsNotVerifiedThroughTheApp() {
        owner(1);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(intent("CANCELLED", ORDER)));
        var error = assertThrows(ResponseStatusException.class, () -> service.verifyRazorpay(AUTH, INVOICE,
            new VerifySubscriptionPaymentRequest(ORDER, "pay_Voided01", "a".repeat(64))));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verifyNoInteractions(provider);
        verify(repository, never()).applyProviderStatus(any(), any(), any(), any(), any());
        server.verify();
    }

    @Test void voidedBillAlreadyPaidStillAnswersPaid() {
        owner(1);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(intent("PAID", ORDER)));
        assertEquals("PAID", service.createProviderOrder(AUTH, INVOICE, null).status());
        verifyNoInteractions(provider);
        server.verify();
    }

    @Test void captureOnVoidedBillsExistingOrderIsStillRecordedByCatchUp() {
        owner(1);
        var voided = intent("CANCELLED", ORDER);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(voided), Optional.of(intent("PAID", ORDER)));
        when(provider.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY))
            .thenReturn(Optional.of(new RazorpayPaymentClient.VerifiedPayment("pay_Late01", "captured", json.createObjectNode())));
        assertEquals("PAID", service.getOwned(AUTH, INVOICE).status());
        var event = ArgumentCaptor.forClass(JsonNode.class);
        verify(repository).applyProviderStatus(eq(voided), eq("PAID"), eq("captured"), eq("pay_Late01"), event.capture());
        assertEquals("SUBSCRIPTION_PAYMENT_STATUS_CHANGED", event.getValue().path("eventType").asText());
        server.verify();
    }

    @Test void captureWebhookOnVoidedBillIsStillRecordedPaid() {
        var voided = intent("CANCELLED", ORDER);
        when(repository.findByProviderOrder("RAZORPAY", ORDER)).thenReturn(Optional.of(voided));
        var payment = json.createObjectNode().put("id", "pay_Late01").put("order_id", ORDER).put("status", "captured")
            .put("amount", 149900).put("currency", "INR");
        service.applyRazorpayWebhook(payment, "payment.captured");
        verify(repository).applyProviderStatus(eq(voided), eq("PAID"), eq("captured"), eq("pay_Late01"), any(JsonNode.class));
    }

    @Test void voidedEventIsAcceptedOnTheSameSubscription() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<EventEnvelope<InvoiceVoidedData>> event = ArgumentCaptor.forClass(EventEnvelope.class);
        when(repository.acceptVoided(event.capture(), any(JsonNode.class))).thenReturn(true);
        assertTrue(service.acceptRequested(voided("SUBSCRIPTION_INVOICE_VOIDED", INVOICE)));
        assertEquals(INVOICE, event.getValue().data().invoiceId());
        assertEquals("PAUSED_CYCLE_VOIDED", event.getValue().data().reason());
        verify(repository, never()).acceptRequest(any(), any());
    }

    @Test void unrelatedOrIncompleteEventsAreStillRejected() {
        for (String raw : new String[] {voided("SUBSCRIPTION_ORDER_REQUESTED", INVOICE), voided("SUBSCRIPTION_INVOICE_VOIDED", null)}) {
            var error = assertThrows(ResponseStatusException.class, () -> service.acceptRequested(raw));
            assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        }
        verify(repository, never()).acceptVoided(any(), any());
        verify(repository, never()).acceptRequest(any(), any());
    }

    @Test void conflictReachesTheAppAsReadableText() throws Exception {
        var payments = mock(SubscriptionPaymentService.class);
        when(payments.createProviderOrder(any(), eq(INVOICE), any()))
            .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "This bill was cancelled when the plan was resumed"));
        var mvc = MockMvcBuilders.standaloneSetup(
            new SubscriptionPaymentController(payments, new PaymentApiProperties(true, false, false))).build();
        mvc.perform(post("/api/v1/subscription-payments/invoices/" + INVOICE + "/orders").header("Authorization", AUTH)
                .contentType(MediaType.APPLICATION_JSON).content("{\"customerName\":\"Fixture\",\"customerPhone\":\"9876543210\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.detail").value("This bill was cancelled when the plan was resumed"));

        // Other refusals keep the default error handling and expose no text.
        when(payments.getLatestOwned(any(), eq(SUBSCRIPTION)))
            .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription payment invoice is not ready"));
        mvc.perform(get("/api/v1/subscription-payments/subscriptions/" + SUBSCRIPTION).header("Authorization", AUTH))
            .andExpect(status().isNotFound())
            .andExpect(content().string(""));
    }
}
