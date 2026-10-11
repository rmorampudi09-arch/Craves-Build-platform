package in.craves.order.refund;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.refund.RefundStatusModels.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

class RefundCompositeCompletionContractTest {
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    final RefundStatusEventValidator validator=new RefundStatusEventValidator();
    ObjectNode completion(boolean walletOnly) throws Exception {
        UUID order=UUID.randomUUID(),checkout=UUID.randomUUID();
        ObjectNode root=json.createObjectNode().put("eventId",UUID.randomUUID().toString()).put("eventType","REFUND_STATUS_CHANGED").put("eventVersion","1.1").put("occurredAt","2026-10-09T00:00:00Z").put("correlationId",checkout.toString()).put("causationId",UUID.randomUUID().toString()).put("source","integration-service").put("subject",order.toString());
        ObjectNode d=root.putObject("data").put("refundId",UUID.randomUUID().toString()).put("checkoutId",checkout.toString()).put("chefSubOrderId",order.toString()).put("customerIdentityId",UUID.randomUUID().toString()).put("refundReference","CRV_TEST_ONLY").put("refundAmount",1000).put("currency","INR").put("reason","CHEF_DECLINED").put("status","REFUNDED").put("provider",walletOnly?"REFERRAL_WALLET":"RAZORPAY").put("providerStatus",walletOnly?"NO_EXTERNAL_REFUND":"SUCCESS").put("updatedAt","2026-10-09T00:00:00Z");
        if(!walletOnly)d.put("providerRefundId","rfnd_TestOnly");
        d.putObject("completion").put("type","ALL_TENDERS_RESTORED").put("gatewayPaise",walletOnly?0:45000).put("walletPaise",walletOnly?75000:30000).put("discountPaise",25000).put("version",1).put("operationId",UUID.nameUUIDFromBytes(("referral-refund/"+order+"/operation").getBytes(StandardCharsets.UTF_8)).toString());return root;
    }
    void validate(ObjectNode event) throws Exception {validator.validate(json.readValue(event.toString(),json.getTypeFactory().constructParametricType(EventEnvelope.class,RefundStatusChangedData.class)));}
    @Test void acceptsExplicitMixedCompletion(){assertDoesNotThrow(()->validate(completion(false)));}
    @Test void acceptsTruthfulWalletOnlyCompletion(){assertDoesNotThrow(()->validate(completion(true)));}
    @Test void acceptsZeroWalletDiscountOnlyCompletion(){assertDoesNotThrow(()->{var e=completion(true);((ObjectNode)e.path("data").path("completion")).put("walletPaise",0).put("discountPaise",100000);validate(e);});}
    @ParameterizedTest @ValueSource(strings={"RAZORPAY","CASHFREE"})
    void acceptsZeroGatewayChildOfExternalCheckout(String provider) throws Exception {var e=completion(true);((ObjectNode)e.path("data")).put("provider",provider);validate(e);}
    @Test void acceptsLegacyCashfreeConstructorAndVersion() throws Exception {var e=completion(false);e.put("eventVersion","1.0");((ObjectNode)e.path("data")).remove("completion");validate(e);}
    @ParameterizedTest @ValueSource(strings={"missingCompletion","wrongType","wrongOperation","missingOperation","missingAmount","negative","fractional","overflow","sumMismatch","fractionalGross","zeroVersion","fractionalVersion","versionOverflow","pending","failed","unsupportedVersion","legacyComposite","unknownProvider","missingProvider","missingProviderId","providerPending","arbitraryProviderStatus","cashfreeMismatch","razorpayWithCashfreeId"})
    void rejectsMalformedMixedCompletion(String mutation) throws Exception {
        var e=completion(false);var d=(ObjectNode)e.path("data");var c=(ObjectNode)d.path("completion");
        switch(mutation){
            case "missingCompletion"->d.remove("completion");case "wrongType"->c.put("type","STARTED");case "wrongOperation"->c.put("operationId",UUID.randomUUID().toString());case "missingOperation"->c.remove("operationId");case "missingAmount"->c.remove("walletPaise");case "negative"->c.put("walletPaise",-1);case "fractional"->c.put("walletPaise",30000.5);case "overflow"->c.put("walletPaise",Long.MAX_VALUE);case "sumMismatch"->c.put("walletPaise",30001);case "fractionalGross"->d.put("refundAmount",1000.001);case "zeroVersion"->c.put("version",0);case "fractionalVersion"->c.put("version",1.5);case "versionOverflow"->c.put("version",Long.MAX_VALUE);case "pending"->d.put("status","REFUND_PENDING");case "failed"->d.put("status","REFUND_FAILED");case "unsupportedVersion"->e.put("eventVersion","1.2");case "legacyComposite"->e.put("eventVersion","1.0");case "unknownProvider"->d.put("provider","UNKNOWN");case "missingProvider"->d.remove("provider");case "missingProviderId"->d.remove("providerRefundId");case "providerPending"->d.put("providerStatus","PENDING");case "arbitraryProviderStatus"->d.put("providerStatus","ALL_TENDERS_RESTORED");case "cashfreeMismatch"->d.put("provider","CASHFREE").put("cfRefundId","DIFFERENT");case "razorpayWithCashfreeId"->d.put("cfRefundId","rfnd_TestOnly");default->throw new AssertionError();
        }
        assertThrows(RefundStatusEventValidator.RefundStatusValidationException.class,()->validate(e));
    }
    @ParameterizedTest @ValueSource(strings={"providerSuccess","externalId","cashfreeId","unknownProvider","legacyVersion"})
    void rejectsFabricatedWalletGatewayEvidence(String mutation) throws Exception {
        var e=completion(true);var d=(ObjectNode)e.path("data");switch(mutation){case "providerSuccess"->d.put("providerStatus","SUCCESS");case "externalId"->d.put("providerRefundId","invented");case "cashfreeId"->d.put("cfRefundId","invented");case "unknownProvider"->d.put("provider","UNKNOWN");case "legacyVersion"->e.put("eventVersion","1.0");default->throw new AssertionError();}assertThrows(RefundStatusEventValidator.RefundStatusValidationException.class,()->validate(e));
    }
}
