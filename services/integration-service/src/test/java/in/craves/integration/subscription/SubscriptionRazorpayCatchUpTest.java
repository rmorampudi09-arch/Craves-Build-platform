package in.craves.integration.subscription;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.subscription.SubscriptionPaymentRepository.PaymentIntent;
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
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class SubscriptionRazorpayCatchUpTest {
    private static final UUID INVOICE = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID SUBSCRIPTION = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final String AUTH = "Bearer isolated-customer-fixture";
    private static final String ORDER = "order_Recovery01";
    private static final String KEY = "rzp_live_fixture";
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

    private PaymentIntent intent(String status, Instant updated, String key) {
        return new PaymentIntent(UUID.fromString("22222222-2222-4222-8222-222222222222"), INVOICE,
            SUBSCRIPTION, UUID.fromString("44444444-4444-4444-8444-444444444444"),
            UUID.fromString("55555555-5555-4555-8555-555555555555"), null,
            LocalDate.of(2026, 8, 12), LocalDate.of(2026, 9, 12), AMOUNT, "INR", status,
            null, null, null, "created", Instant.parse("2026-08-12T06:30:00Z"), updated,
            "PAID".equals(status) ? updated : null, "RAZORPAY", ORDER, null, key);
    }
    private PaymentIntent old(String status) { return intent(status, Instant.parse("2026-08-12T06:30:00Z"), KEY); }
    private void owner(int count) {
        server.expect(ExpectedCount.times(count), requestTo("https://subscription.test/api/v1/subscriptions/" + SUBSCRIPTION))
            .andExpect(method(HttpMethod.GET)).andExpect(header("Authorization", AUTH)).andRespond(withSuccess());
    }
    private void capture() {
        when(provider.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY))
            .thenReturn(Optional.of(new RazorpayPaymentClient.VerifiedPayment("pay_One", "captured", json.createObjectNode())));
    }
    private void noCreation() {
        verify(provider, never()).createOrder(anyString(), any(), anyString(), anyMap());
        verify(repository, never()).storeRazorpayOrder(any(), anyString(), anyString(), anyString());
    }

    @Test void missedWebhookUpdatesOwnedInvoiceUsingExistingDurableStatusPath() {
        var pending = old("PAYMENT_PENDING"); var paid = old("PAID");
        owner(1); capture();
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(pending), Optional.of(paid));
        assertEquals("PAID", service.getOwned(AUTH, INVOICE).status());
        var event = ArgumentCaptor.forClass(JsonNode.class);
        verify(repository).applyProviderStatus(eq(pending), eq("PAID"), eq("captured"), eq("pay_One"), event.capture());
        assertEquals(INVOICE.toString(), event.getValue().path("correlationId").asText());
        assertEquals("PAID", event.getValue().path("data").path("status").asText());
        noCreation(); server.verify();
    }
    @Test void retryOfFailedOriginalOrderReconcilesInsteadOfCreatingAnother() {
        var failed = old("FAILED"); var paid = old("PAID");
        owner(1); capture();
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(failed), Optional.of(paid));
        assertEquals("PAID", service.createProviderOrder(AUTH, INVOICE, null).status());
        noCreation(); server.verify();
    }
    @Test void latestOwnedInvoiceAlsoUsesRazorpayCatchUp() {
        var pending = old("PAYMENT_PENDING"); var paid = old("PAID");
        owner(1); capture();
        when(repository.findLatestBySubscription(SUBSCRIPTION)).thenReturn(Optional.of(pending));
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(paid));
        assertEquals("PAID", service.getLatestOwned(AUTH, SUBSCRIPTION).status());
        noCreation(); server.verify();
    }
    @Test void replayAfterPaidDoesNotRepeatProviderReadOrStatusEvent() {
        var pending = old("PAYMENT_PENDING"); var paid = old("PAID");
        owner(2); capture();
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(pending), Optional.of(paid), Optional.of(paid));
        assertEquals("PAID", service.getOwned(AUTH, INVOICE).status());
        assertEquals("PAID", service.getOwned(AUTH, INVOICE).status());
        verify(provider, times(1)).findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY);
        verify(repository, times(1)).applyProviderStatus(any(), eq("PAID"), anyString(), anyString(), any());
        noCreation(); server.verify();
    }
    @Test void providerFailureKeepsExistingStateAndNeverCreatesReplacement() {
        var pending = old("PAYMENT_PENDING"); owner(1);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(pending));
        when(provider.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY))
            .thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "fixture network failure"));
        assertEquals("PAYMENT_PENDING", service.getOwned(AUTH, INVOICE).status());
        verify(repository, never()).applyProviderStatus(any(), anyString(), anyString(), any(), any());
        noCreation(); server.verify();
    }
    @Test void noCaptureIsNotChangedToFailed() {
        var pending = old("PAYMENT_PENDING"); owner(1);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(pending));
        when(provider.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY)).thenReturn(Optional.empty());
        assertEquals("PAYMENT_PENDING", service.getOwned(AUTH, INVOICE).status());
        verify(repository, never()).applyProviderStatus(any(), anyString(), anyString(), any(), any());
        noCreation(); server.verify();
    }
    @Test void futureTimestampDoesNotTriggerProviderRead() {
        var pending = intent("PAYMENT_PENDING", Instant.now().plusSeconds(3600), KEY); owner(1);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(pending));
        assertEquals("PAYMENT_PENDING", service.getOwned(AUTH, INVOICE).status());
        verifyNoInteractions(provider); server.verify();
    }
    @Test void missingOriginalKeyBindingIsNotGuessed() {
        var pending = intent("PAYMENT_PENDING", Instant.parse("2026-08-12T06:30:00Z"), null); owner(1);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(pending));
        assertEquals("PAYMENT_PENDING", service.getOwned(AUTH, INVOICE).status());
        verifyNoInteractions(provider); server.verify();
    }
    @Test void wrongOwnerCannotStartRecoveryOrWritePaymentStatus() {
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(old("PAYMENT_PENDING")));
        server.expect(requestTo("https://subscription.test/api/v1/subscriptions/" + SUBSCRIPTION))
            .andExpect(method(HttpMethod.GET)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertThrows(ResponseStatusException.class, () -> service.getOwned(AUTH, INVOICE));
        verifyNoInteractions(provider);
        verify(repository, never()).applyProviderStatus(any(), anyString(), anyString(), any(), any());
        server.verify();
    }
}
