package in.craves.integration.refund;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.refund.RefundModels.RefundWorkItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class RazorpayRefundClientTest {
    final ObjectMapper json=new ObjectMapper();RazorpayRefundClient client;MockRestServiceServer server;
    RefundWorkItem item;
    @BeforeEach void setup() {
        var builder=RestClient.builder().baseUrl("https://api.razorpay.com");
        server=MockRestServiceServer.bindTo(builder).build();
        client=new RazorpayRefundClient(RefundTestData.properties(true),json,builder.build());
        item=RefundTestData.item("CREATE","REQUESTED",1,null);
    }
    ObjectNode response() {
        ObjectNode value=json.createObjectNode().put("id","rfnd_TestRefund").put("entity","refund")
            .put("amount",1234).put("currency","INR").put("payment_id",item.providerPaymentId())
            .put("receipt",item.refundReference()).put("status","processed");
        value.putObject("notes").put("craves_refund_id",item.refundId().toString());return value;
    }
    void expectCreate(ObjectNode response) {
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_TestPayment/refund"))
            .andExpect(method(HttpMethod.POST)).andExpect(header("X-Refund-Idempotency",item.idempotencyKey().toString()))
            .andExpect(headerDoesNotExist("X-Razorpay-Idempotency-Key"))
            .andExpect(jsonPath("$.amount").value(1234)).andExpect(jsonPath("$.speed").value("normal"))
            .andRespond(withSuccess(response.toString(),MediaType.APPLICATION_JSON));
    }
    @Test void persistedRequestUsesCorrectHeaderExactPaiseAndSameBodyOnRetry() {
        String body=client.prepareRequest(item);String hash=RazorpayRefundClient.hash(body);
        expectCreate(response());expectCreate(response());
        assertEquals("SUCCESS",client.createRefund(item,body,hash).providerStatus());
        assertEquals("SUCCESS",client.createRefund(item,body,hash).providerStatus());
        assertEquals(body,client.prepareRequest(item));server.verify();
    }
    @Test void unpreparedLegacyCreateEntrypointNeverCallsProvider() {
        assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.createRefund(item));server.verify();
    }
    @Test void changedPersistedBodyOrDigestNeverCallsProvider() {
        String body=client.prepareRequest(item);
        assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.createRefund(item,body,"0".repeat(64)));
        assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.createRefund(item,body+" ",RazorpayRefundClient.hash(body+" ")));
        server.verify();
    }
    @ParameterizedTest @ValueSource(strings={"id","entity","payment_id","amount","currency","receipt","status","notes"})
    void responseDimensionsMustMatchBeforeConfirming(String field) {
        ObjectNode value=response();if(field.equals("amount"))value.put(field,1235);else value.put(field,"mismatch");
        expectCreate(value);String body=client.prepareRequest(item);
        assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.createRefund(item,body,RazorpayRefundClient.hash(body)));
        server.verify();
    }
    @Test void fractionalAndStringProviderAmountsAreRejected() {
        expectCreate(response().put("amount","1234"));expectCreate(response().put("amount",1234.1));
        for(int i=0;i<2;i++) {
            String body=client.prepareRequest(item);
            assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.createRefund(item,body,RazorpayRefundClient.hash(body)));
        }server.verify();
    }
    @Test void knownIdUsesPaymentScopedGetAndStillWorksWhenPaymentCreationIsOff() {
        var builder=RestClient.builder().baseUrl("https://api.razorpay.com");server=MockRestServiceServer.bindTo(builder).build();
        client=new RazorpayRefundClient(RefundTestData.properties(false),json,builder.build());
        item=RefundTestData.item("GET","PENDING",8,"rfnd_TestRefund");
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_TestPayment/refunds/rfnd_TestRefund"))
            .andExpect(method(HttpMethod.GET)).andRespond(withSuccess(response().toString(),MediaType.APPLICATION_JSON));
        assertEquals("SUCCESS",client.getRefund(item).providerStatus());server.verify();
    }
    @Test void knownIdCannotBeReplacedByAnotherRefund() {
        item=RefundTestData.item("GET","PENDING",8,"rfnd_Another");
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_TestPayment/refunds/rfnd_Another"))
            .andRespond(withSuccess(response().toString(),MediaType.APPLICATION_JSON));
        assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.getRefund(item));server.verify();
    }
    void expectLookup(ObjectNode collection) {
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_TestPayment/refunds?count=100&skip=0"))
            .andExpect(method(HttpMethod.GET)).andRespond(withSuccess(collection.toString(),MediaType.APPLICATION_JSON));
    }
    @Test void legacyMissingIdFindsUniqueBoundRefundByGetOnly() {
        ObjectNode collection=json.createObjectNode().put("entity","collection").put("count",1);
        collection.putArray("items").add(response());expectLookup(collection);
        assertEquals("rfnd_TestRefund",client.findExistingRefund(item).cfRefundId());server.verify();
    }
    @Test void noMatchNeverCreatesOrClaimsFailedRefund() {
        ObjectNode collection=json.createObjectNode().put("entity","collection").put("count",0);collection.putArray("items");expectLookup(collection);
        assertEquals("LOOKUP_NO_MATCH",assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.findExistingRefund(item)).getMessage());server.verify();
    }
    @Test void duplicateMatchesRetainUnknownOutcome() {
        ObjectNode collection=json.createObjectNode().put("entity","collection").put("count",2);
        collection.putArray("items").add(response()).add(response().put("id","rfnd_Second"));expectLookup(collection);
        assertEquals("LOOKUP_AMBIGUOUS",assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.findExistingRefund(item)).getMessage());server.verify();
    }
    @Test void errorBodiesAndCausesAreNeverExposed() {
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_TestPayment/refunds?count=100&skip=0"))
            .andRespond(withStatus(HttpStatus.FORBIDDEN).body("sensitive-provider-body").contentType(MediaType.APPLICATION_JSON));
        var error=assertThrows(RazorpayRefundClient.RefundHttpException.class,()->client.findExistingRefund(item));
        assertEquals("REFUND_PROVIDER_HTTP_403",error.getMessage());assertNull(error.getCause());server.verify();
    }
    @Test void persistedEvidenceExcludesArbitraryProviderNotes() {
        var value=response();value.put("unexpectedSensitiveField","DO_NOT_PERSIST");expectCreate(value);
        String body=client.prepareRequest(item);var result=client.createRefund(item,body,RazorpayRefundClient.hash(body));
        assertFalse(result.providerPayload().contains("DO_NOT_PERSIST"));assertFalse(result.providerPayload().contains("notes"));server.verify();
    }
    @Test void inconsistentCollectionCountCannotProveUniqueRecovery() {
        var collection=json.createObjectNode().put("entity","collection").put("count",2);
        collection.putArray("items").add(response());expectLookup(collection);
        assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.findExistingRefund(item));server.verify();
    }
    @Test void oversizedProviderResponseFailsClosed() {
        server.expect(requestTo("https://api.razorpay.com/v1/payments/pay_TestPayment/refunds?count=100&skip=0"))
            .andRespond(withSuccess(" ".repeat(262145),MediaType.APPLICATION_JSON));
        assertThrows(RazorpayRefundClient.RefundEvidenceException.class,()->client.findExistingRefund(item));server.verify();
    }
}
