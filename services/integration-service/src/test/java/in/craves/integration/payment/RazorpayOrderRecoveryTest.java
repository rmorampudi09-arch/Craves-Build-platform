package in.craves.integration.payment;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.RazorpayProviderProperties;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** Actual HTTP request construction against an in-process mock; no provider traffic. */
class RazorpayOrderRecoveryTest {
    private static final String ORDER = "order_Recovery01";
    private static final String KEY = "rzp_live_fixture";
    private static final BigDecimal AMOUNT = new BigDecimal("1499.00");
    private final ObjectMapper json = new ObjectMapper();
    private MockRestServiceServer server;
    private RazorpayPaymentClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        // New payment execution is deliberately off, and auto-capture is on.
        // Recovery must still issue only GET, never auto-capture or a new order.
        var properties = new RazorpayProviderProperties("PRODUCTION", true, false,
            KEY, "IN_PROCESS_TEST_SECRET", "IN_PROCESS_WEBHOOK_SECRET",
            "https://razorpay.test", "https://craves.test/webhook", true);
        client = new RazorpayPaymentClient(properties, builder);
    }

    private ObjectNode payment(String id, String status) {
        return json.createObjectNode().put("entity", "payment").put("id", id)
            .put("order_id", ORDER).put("amount", 149900).put("currency", "INR")
            .put("status", status).put("captured", "captured".equals(status))
            .put("amount_refunded", 0).putNull("refund_status");
    }
    private ObjectNode collection(ObjectNode... rows) {
        ObjectNode result = json.createObjectNode().put("entity", "collection").put("count", rows.length);
        var items = result.putArray("items");
        for (var row : rows) items.add(row);
        return result;
    }
    private void respond(ObjectNode response) {
        server.expect(requestTo("https://razorpay.test/v1/orders/" + ORDER + "/payments"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("Authorization", org.hamcrest.Matchers.startsWith("Basic ")))
            .andRespond(withSuccess(response.toString(), MediaType.APPLICATION_JSON));
    }
    private void reject(ObjectNode response) {
        respond(response);
        assertThrows(ResponseStatusException.class,
            () -> client.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY));
        server.verify();
    }

    @Test void capturedPaymentRecoveredWhileNewPaymentExecutionIsPaused() {
        respond(collection(payment("pay_One", "captured")));
        var result = client.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY).orElseThrow();
        assertEquals("pay_One", result.paymentId());
        assertEquals("captured", result.providerStatus());
        server.verify();
    }
    @Test void authorizedPaymentIsNeverCapturedByRecovery() {
        respond(collection(payment("pay_One", "authorized")));
        assertTrue(client.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY).isEmpty());
        server.verify();
    }
    @Test void emptyFailedAndRefundedCollectionsDoNotInventCapturedPayments() {
        respond(collection(payment("pay_Failed", "failed"), payment("pay_Refunded", "refunded")));
        assertTrue(client.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY).isEmpty());
        server.verify();
    }
    @Test void emptyCollectionIsNotProofOfPaymentFailure() {
        respond(collection());
        assertTrue(client.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY).isEmpty());
        server.verify();
    }
    @Test void anotherProviderOrderIsRejected() {
        reject(collection(payment("pay_One", "captured").put("order_id", "order_Other")));
    }
    @Test void wrongAmountIsRejected() {
        reject(collection(payment("pay_One", "captured").put("amount", 149901)));
    }
    @Test void fractionalSubunitsAreRejectedInsteadOfTruncated() {
        reject(collection(payment("pay_One", "captured").put("amount", 149900.5)));
    }
    @Test void wrongCurrencyIsRejected() {
        reject(collection(payment("pay_One", "captured").put("currency", "USD")));
    }
    @Test void partialRefundRequiresReviewRatherThanPlanReactivation() {
        reject(collection(payment("pay_One", "captured").put("amount_refunded", 100).put("refund_status", "partial")));
    }
    @Test void missingRefundEvidenceIsRejected() {
        var row = payment("pay_One", "captured");
        row.remove("amount_refunded");
        reject(collection(row));
    }
    @Test void contradictoryCaptureFlagIsRejected() {
        reject(collection(payment("pay_One", "captured").put("captured", false)));
    }
    @Test void multipleCapturedPaymentsRequireReview() {
        reject(collection(payment("pay_One", "captured"), payment("pay_Two", "captured")));
    }
    @Test void duplicatePaymentIdentityIsRejected() {
        reject(collection(payment("pay_One", "captured"), payment("pay_One", "captured")));
    }
    @Test void incompleteCollectionIsRejected() {
        reject(collection(payment("pay_One", "captured")).put("count", 2));
    }
    @Test void changedOriginalAccountBindingDoesNotContactProvider() {
        assertThrows(ResponseStatusException.class,
            () -> client.findCapturedOrderPayment(ORDER, AMOUNT, "INR", "rzp_test_other"));
        server.verify();
    }
    @Test void invalidProviderIdentityDoesNotContactProvider() {
        assertThrows(ResponseStatusException.class,
            () -> client.findCapturedOrderPayment("order_../other", AMOUNT, "INR", KEY));
        server.verify();
    }
    @Test void providerErrorIsRedactedAndDoesNotTriggerAnotherRequest() {
        server.expect(requestTo("https://razorpay.test/v1/orders/" + ORDER + "/payments"))
            .andExpect(method(HttpMethod.GET))
            .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("PRIVATE_PROVIDER_DETAIL"));
        var error = assertThrows(ResponseStatusException.class,
            () -> client.findCapturedOrderPayment(ORDER, AMOUNT, "INR", KEY));
        assertFalse(error.getMessage().contains("PRIVATE_PROVIDER_DETAIL"));
        server.verify();
    }
}
