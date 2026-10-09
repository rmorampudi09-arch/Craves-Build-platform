package in.craves.integration.subscription;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.subscription.SubscriptionPaymentModels.CreateSubscriptionPaymentOrderRequest;
import in.craves.integration.subscription.SubscriptionPaymentRepository.PaymentIntent;
import java.math.BigDecimal;
import java.net.SocketTimeoutException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseActions;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** All HTTP and payment-provider calls are intercepted; no real provider or database is used. */
class SubscriptionPaymentEligibilityGuardTest {
    private static final UUID INVOICE = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID SUBSCRIPTION = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID INTENT = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID CUSTOMER = UUID.fromString("55555555-5555-4555-8555-555555555555");
    private static final UUID OTHER_CUSTOMER = UUID.fromString("66666666-6666-4666-8666-666666666666");
    private static final BigDecimal AMOUNT = new BigDecimal("1499.00");
    private static final String AUTH = "Bearer verified-customer-fixture";
    private static final String SUBSCRIPTION_URL = "https://subscription.test/api/v1/subscriptions/" + SUBSCRIPTION;
    private static final String CASHFREE_ORDER = "CRVSUB_33333333333343338333333333333333";
    private static final String RAZORPAY_ORDER = "order_Fixture01";
    private static final CravesPrincipal PRINCIPAL = new CravesPrincipal(CUSTOMER, "9876543210", Set.of("CUSTOMER"));
    private static final CreateSubscriptionPaymentOrderRequest REQUEST = new CreateSubscriptionPaymentOrderRequest(
        "Fixture Customer", "9876543210", "customer@example.test", "https://craves.test/return"
    );
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private SubscriptionPaymentRepository repository;
    private RazorpayPaymentClient razorpay;
    private SubscriptionPaymentService service;
    private MockRestServiceServer server;

    private void setUp(String provider) {
        setUp(provider, "https://subscription.test");
    }

    private void setUp(String provider, String subscriptionServiceUrl) {
        repository = mock(SubscriptionPaymentRepository.class);
        razorpay = mock(RazorpayPaymentClient.class);
        var properties = new SubscriptionPaymentProperties();
        properties.setSubscriptionServiceBaseUrl(subscriptionServiceUrl);
        var cashfree = new PaymentProviderProperties("sandbox", false, false, "2025-01-01",
            "fixture-client", "fixture-secret", "https://cashfree.test", "https://unused-production.test",
            "https://craves.test/return", "https://craves.test/webhook", "", 300, "2025-01-01");
        var builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        service = new SubscriptionPaymentService(repository, properties, cashfree,
            new PaymentRoutingProperties(provider, true, false), razorpay, json, builder,
            subscriptionServiceUrl.isBlank() ? null : builder.clone().baseUrl(subscriptionServiceUrl).build());
    }

    private void newIntent(UUID owner) {
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(intent("PAYMENT_REQUESTED", owner, "CASHFREE", null)));
    }

    private void ownership(HttpStatus status) {
        server.expect(requestTo(SUBSCRIPTION_URL))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", AUTH))
            .andRespond(withStatus(status));
    }

    private ResponseActions eligibility() {
        return server.expect(requestTo(SUBSCRIPTION_URL + "/payment-eligibility?expectedCustomerIdentityId=" + CUSTOMER))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", AUTH));
    }

    private void assertBlocked(CravesPrincipal principal, HttpStatus status) {
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
            () -> service.createProviderOrder(AUTH, INVOICE, REQUEST, principal));
        assertEquals(status, failure.getStatusCode());
        // A single durable read is the only allowed repository operation on every rejected new order.
        verify(repository).findByInvoice(INVOICE);
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(razorpay);
        server.verify();
    }

    private static Stream<Arguments> invalidPrincipals() {
        return Stream.of("RAZORPAY", "CASHFREE").flatMap(provider -> Stream.of(
            Arguments.of(provider, "missing principal", null, HttpStatus.UNAUTHORIZED),
            Arguments.of(provider, "missing identity", new CravesPrincipal(null, "", Set.of("CUSTOMER")), HttpStatus.UNAUTHORIZED),
            Arguments.of(provider, "foreign customer", new CravesPrincipal(OTHER_CUSTOMER, "", Set.of("CUSTOMER")), HttpStatus.FORBIDDEN),
            Arguments.of(provider, "admin only", new CravesPrincipal(CUSTOMER, "", Set.of("ADMIN")), HttpStatus.FORBIDDEN),
            Arguments.of(provider, "payments admin only", new CravesPrincipal(CUSTOMER, "", Set.of("PAYMENTS_ADMIN")), HttpStatus.FORBIDDEN),
            Arguments.of(provider, "chef only", new CravesPrincipal(CUSTOMER, "", Set.of("CHEF")), HttpStatus.FORBIDDEN),
            Arguments.of(provider, "no roles", new CravesPrincipal(CUSTOMER, "", Set.of()), HttpStatus.FORBIDDEN),
            Arguments.of(provider, "null roles", new CravesPrincipal(CUSTOMER, "", null), HttpStatus.FORBIDDEN)
        ));
    }

    @ParameterizedTest(name = "{0} rejects {1} before eligibility or payment side effects")
    @MethodSource("invalidPrincipals")
    void requiresVerifiedMatchingCustomer(String provider, String scenario, CravesPrincipal principal, HttpStatus status) {
        setUp(provider);
        newIntent(CUSTOMER);
        ownership(HttpStatus.OK);
        assertBlocked(principal, status);
    }

    @ParameterizedTest
    @ValueSource(strings = {"RAZORPAY", "CASHFREE"})
    void successfulSubscriptionReadCannotOverrideMismatchedDurableIntentOwner(String provider) {
        setUp(provider);
        newIntent(OTHER_CUSTOMER);
        ownership(HttpStatus.OK);
        assertBlocked(PRINCIPAL, HttpStatus.FORBIDDEN);
    }

    @ParameterizedTest
    @ValueSource(strings = {"RAZORPAY", "CASHFREE"})
    void inaccessibleSubscriptionIsRejectedBeforeEligibilityOrProvider(String provider) {
        setUp(provider);
        newIntent(CUSTOMER);
        ownership(HttpStatus.NOT_FOUND);
        assertBlocked(PRINCIPAL, HttpStatus.NOT_FOUND);
    }

    @ParameterizedTest
    @ValueSource(strings = {"RAZORPAY", "CASHFREE"})
    void missingAuthorizationFailsBeforeAnyRepositoryOrHttpCall(String provider) {
        setUp(provider);
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
            () -> service.createProviderOrder(null, INVOICE, REQUEST, PRINCIPAL));
        assertEquals(HttpStatus.UNAUTHORIZED, failure.getStatusCode());
        verifyNoInteractions(repository, razorpay);
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"RAZORPAY", "CASHFREE"})
    void missingSubscriptionConfigurationFailsClosed(String provider) {
        setUp(provider, "");
        newIntent(CUSTOMER);
        assertBlocked(PRINCIPAL, HttpStatus.SERVICE_UNAVAILABLE);
    }

    private static Stream<Arguments> eligibilityFailures() {
        return Stream.of("RAZORPAY", "CASHFREE").flatMap(provider -> Stream.of(
            Arguments.of(provider, HttpStatus.BAD_REQUEST, HttpStatus.BAD_REQUEST),
            Arguments.of(provider, HttpStatus.NOT_FOUND, HttpStatus.BAD_REQUEST),
            Arguments.of(provider, HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN),
            Arguments.of(provider, HttpStatus.FORBIDDEN, HttpStatus.FORBIDDEN),
            Arguments.of(provider, HttpStatus.INTERNAL_SERVER_ERROR, HttpStatus.SERVICE_UNAVAILABLE),
            Arguments.of(provider, HttpStatus.BAD_GATEWAY, HttpStatus.SERVICE_UNAVAILABLE),
            Arguments.of(provider, HttpStatus.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE),
            Arguments.of(provider, HttpStatus.GATEWAY_TIMEOUT, HttpStatus.SERVICE_UNAVAILABLE),
            Arguments.of(provider, HttpStatus.OK, HttpStatus.BAD_GATEWAY),
            Arguments.of(provider, HttpStatus.CREATED, HttpStatus.BAD_GATEWAY),
            Arguments.of(provider, HttpStatus.ACCEPTED, HttpStatus.BAD_GATEWAY),
            Arguments.of(provider, HttpStatus.RESET_CONTENT, HttpStatus.BAD_GATEWAY),
            Arguments.of(provider, HttpStatus.PARTIAL_CONTENT, HttpStatus.BAD_GATEWAY),
            Arguments.of(provider, HttpStatus.FOUND, HttpStatus.BAD_GATEWAY),
            Arguments.of(provider, HttpStatus.NOT_MODIFIED, HttpStatus.BAD_GATEWAY)
        ));
    }

    @ParameterizedTest(name = "{0} rejects eligibility HTTP {1}")
    @MethodSource("eligibilityFailures")
    void onlyExactNoContentEligibilityAllowsNewOrder(String provider, HttpStatus upstream, HttpStatus expected) {
        setUp(provider);
        newIntent(CUSTOMER);
        ownership(HttpStatus.OK);
        eligibility().andRespond(withStatus(upstream));
        assertBlocked(PRINCIPAL, expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"RAZORPAY", "CASHFREE"})
    void malformedEligibilityPayloadCannotBeInterpretedAsPermission(String provider) {
        setUp(provider);
        newIntent(CUSTOMER);
        ownership(HttpStatus.OK);
        eligibility().andRespond(withSuccess("{\"eligible\": true, BROKEN_JSON", MediaType.APPLICATION_JSON));
        assertBlocked(PRINCIPAL, HttpStatus.BAD_GATEWAY);
    }

    @ParameterizedTest
    @ValueSource(strings = {"RAZORPAY", "CASHFREE"})
    void eligibilityTimeoutFailsClosedWithoutWritingIntentOrCallingProvider(String provider) {
        setUp(provider);
        newIntent(CUSTOMER);
        ownership(HttpStatus.OK);
        eligibility().andRespond(withException(new SocketTimeoutException("fixture eligibility timeout")));
        assertBlocked(PRINCIPAL, HttpStatus.SERVICE_UNAVAILABLE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"RAZORPAY", "CASHFREE"})
    void failedIntentWithoutExistingOrderStillRequiresEligibility(String provider) {
        setUp(provider);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(intent("FAILED", CUSTOMER, provider, null)));
        ownership(HttpStatus.OK);
        eligibility().andRespond(withStatus(HttpStatus.BAD_REQUEST));
        assertBlocked(PRINCIPAL, HttpStatus.BAD_REQUEST);
    }

    @Test
    void eligibleCustomerCreatesAndPersistsExactlyOneRazorpayOrder() {
        setUp("RAZORPAY");
        newIntent(CUSTOMER);
        ownership(HttpStatus.OK);
        eligibility().andRespond(withStatus(HttpStatus.NO_CONTENT));
        PaymentIntent stored = intent("PAYMENT_PENDING", CUSTOMER, "RAZORPAY", RAZORPAY_ORDER);
        when(razorpay.createOrder(eq(CASHFREE_ORDER), eq(AMOUNT), eq("INR"), anyMap()))
            .thenReturn(new RazorpayPaymentClient.CreatedOrder(RAZORPAY_ORDER, "created", "rzp_test_fixture", Map.of(), json.createObjectNode()));
        when(repository.storeRazorpayOrder(INTENT, RAZORPAY_ORDER, "rzp_test_fixture", "created")).thenReturn(stored);
        when(repository.response(stored)).thenReturn(new SubscriptionPaymentRepository(null).response(stored));

        var response = service.createProviderOrder(AUTH, INVOICE, REQUEST, PRINCIPAL);

        assertEquals("PAYMENT_PENDING", response.status());
        assertEquals(RAZORPAY_ORDER, response.providerOrderId());
        verify(razorpay).createOrder(CASHFREE_ORDER, AMOUNT, "INR", Map.of(
            "craves_invoice_id", INVOICE.toString(), "craves_subscription_id", SUBSCRIPTION.toString()));
        verify(repository).findByInvoice(INVOICE);
        verify(repository).storeRazorpayOrder(INTENT, RAZORPAY_ORDER, "rzp_test_fixture", "created");
        verify(repository).response(stored);
        verifyNoMoreInteractions(repository, razorpay);
        server.verify();
    }

    @Test
    void eligibleCustomerCreatesAndPersistsExactlyOneCashfreeOrder() {
        setUp("CASHFREE");
        newIntent(CUSTOMER);
        ownership(HttpStatus.OK);
        eligibility().andRespond(withStatus(HttpStatus.NO_CONTENT));
        server.expect(requestTo("https://cashfree.test/pg/orders"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("x-client-id", "fixture-client"))
            .andExpect(header("x-client-secret", "fixture-secret"))
            .andExpect(header("x-api-version", "2025-01-01"))
            .andExpect(header("x-idempotency-key", INVOICE.toString()))
            .andExpect(content().json("""
                {"order_id":"%s","order_amount":1499.00,"order_currency":"INR",
                 "customer_details":{"customer_id":"%s","customer_name":"Fixture Customer"}}
                """.formatted(CASHFREE_ORDER, CUSTOMER)))
            .andRespond(withSuccess("""
                {"order_id":"%s","cf_order_id":"cf_fixture","payment_session_id":"session_fixture",
                 "order_status":"ACTIVE","order_amount":1499.00,"order_currency":"INR"}
                """.formatted(CASHFREE_ORDER), MediaType.APPLICATION_JSON));
        PaymentIntent stored = intent("PAYMENT_PENDING", CUSTOMER, "CASHFREE", CASHFREE_ORDER);
        when(repository.storeProviderOrder(eq(INTENT), eq(CASHFREE_ORDER), eq("cf_fixture"),
            eq("session_fixture"), eq("ACTIVE"), any(JsonNode.class), any(JsonNode.class))).thenReturn(stored);
        when(repository.response(stored)).thenReturn(new SubscriptionPaymentRepository(null).response(stored));

        var response = service.createProviderOrder(AUTH, INVOICE, REQUEST, PRINCIPAL);

        assertEquals("PAYMENT_PENDING", response.status());
        assertEquals(CASHFREE_ORDER, response.providerOrderId());
        verify(repository).findByInvoice(INVOICE);
        verify(repository).storeProviderOrder(eq(INTENT), eq(CASHFREE_ORDER), eq("cf_fixture"),
            eq("session_fixture"), eq("ACTIVE"), any(JsonNode.class), any(JsonNode.class));
        verify(repository).response(stored);
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(razorpay);
        server.verify();
    }

    private static Stream<Arguments> existingOrders() {
        return Stream.of("RAZORPAY", "CASHFREE").flatMap(provider ->
            List.of("PAID", "PAYMENT_PENDING", "FAILED").stream().map(status -> Arguments.of(provider, status)));
    }

    @ParameterizedTest(name = "existing {0} {1} remains readable without new-order eligibility")
    @MethodSource("existingOrders")
    void adminReadOrRetryOfExistingOrderDoesNotRequireCustomerEligibility(String provider, String status) {
        setUp(provider);
        String order = provider.equals("RAZORPAY") ? RAZORPAY_ORDER : CASHFREE_ORDER;
        PaymentIntent existing = intent(status, CUSTOMER, provider, order);
        when(repository.findByInvoice(INVOICE)).thenReturn(Optional.of(existing));
        when(repository.response(existing)).thenReturn(new SubscriptionPaymentRepository(null).response(existing));
        ownership(HttpStatus.OK);
        CravesPrincipal admin = new CravesPrincipal(OTHER_CUSTOMER, "", Set.of("ADMIN"));

        var response = service.createProviderOrder(AUTH, INVOICE, REQUEST, admin);

        assertEquals(status, response.status());
        assertEquals(order, response.providerOrderId());
        verify(repository).findByInvoice(INVOICE);
        verify(repository).response(existing);
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(razorpay);
        // No eligibility or new provider HTTP request was configured, so either would fail this test.
        server.verify();
    }

    private PaymentIntent intent(String status, UUID customer, String provider, String order) {
        Instant now = Instant.now();
        return new PaymentIntent(INTENT, INVOICE, SUBSCRIPTION,
            UUID.fromString("44444444-4444-4444-8444-444444444444"), customer, null,
            LocalDate.of(2026, 8, 12), LocalDate.of(2026, 9, 12), AMOUNT, "INR", status,
            provider.equals("CASHFREE") ? order : null, null,
            provider.equals("CASHFREE") && order != null ? "session_fixture" : null,
            order == null ? null : "created", now, now, status.equals("PAID") ? now : null,
            provider, order, null, provider.equals("RAZORPAY") && order != null ? "rzp_test_fixture" : null);
    }
}
