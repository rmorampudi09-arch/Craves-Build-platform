package in.craves.integration.payout;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class RazorpayXPayoutClientTest {
    final ObjectMapper json=new ObjectMapper();RazorpayXPayoutClient client;MockRestServiceServer server;
    final RazorpayXPayoutClient.Instruction instruction=new RazorpayXPayoutClient.Instruction(UUID.randomUUID(),"fa_testchef","343.17",null);
    @BeforeEach void setup() {
        var builder=RestClient.builder().baseUrl("https://api.razorpay.com");server=MockRestServiceServer.bindTo(builder).build();
        client=new RazorpayXPayoutClient(builder.build(),"rzp_live_TEST_ONLY","NONSECRET_TEST_VALUE","TEST_ACCOUNT",true);
    }
    ObjectNode response() {return json.createObjectNode().put("id","pout_test").put("fund_account_id",instruction.fundAccountId())
        .put("reference_id",instruction.id().toString()).put("currency","INR").put("amount",34317).put("status","processing");}
    @Test void payoutRequestUsesExactPaiseAndPersistedUuidIdempotency() {
        server.expect(requestTo("https://api.razorpay.com/v1/payouts")).andExpect(method(HttpMethod.POST))
            .andExpect(header("X-Payout-Idempotency",instruction.id().toString()))
            .andExpect(jsonPath("$.amount").value(34317)).andExpect(jsonPath("$.fund_account_id").value("fa_testchef"))
            .andExpect(jsonPath("$.queue_if_low_balance").value(false)).andExpect(jsonPath("$.reference_id").value(instruction.id().toString()))
            .andRespond(withSuccess(response().toString(),MediaType.APPLICATION_JSON));
        assertEquals("processing",client.submit(instruction).status());server.verify();
    }
    @Test void knownPayoutReconciliationUsesGetNotAnotherPost() {
        server.expect(requestTo("https://api.razorpay.com/v1/payouts/pout_test")).andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess(response().put("status","processed").put("utr","TEST_UTR").toString(),MediaType.APPLICATION_JSON));
        assertEquals("processed",client.fetch(new RazorpayXPayoutClient.Instruction(instruction.id(),instruction.fundAccountId(),instruction.amount(),"pout_test")).status());server.verify();
    }
    @ParameterizedTest @ValueSource(strings={"currency","amount","fund_account_id","reference_id","status","id"})
    void mismatchedProviderContextNeverConfirmsTransfer(String field) {
        var value=response();if(field.equals("amount"))value.put(field,34318);else value.put(field,"invalid");
        assertThrows(IllegalStateException.class,()->RazorpayXPayoutClient.verify(instruction,value));
    }
    @Test void fractionalOrStringAmountIsNotAcceptedAsProviderMoney() {
        assertThrows(IllegalStateException.class,()->RazorpayXPayoutClient.verify(instruction,response().put("amount","34317")));
        assertThrows(IllegalStateException.class,()->RazorpayXPayoutClient.verify(instruction,response().put("amount",34317.5)));
    }
    @Test void disabledOrTestKeyConfigurationDoesNotSendMoney() {
        var disabled=new RazorpayXPayoutClient(RestClient.create(),"rzp_test_TEST","TEST_ONLY","TEST_ACCOUNT",true);
        assertFalse(disabled.ready());assertThrows(IllegalStateException.class,()->disabled.submit(instruction));
    }
    @Test void webhookSignatureUsesExactRawBytesAndRejectsTampering() throws Exception {
        byte[] body="{\"event\":\"payout.processed\"}".getBytes(StandardCharsets.UTF_8);String secret="NONSECRET_TEST_WEBHOOK";
        Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        String signature=HexFormat.of().formatHex(mac.doFinal(body));
        assertDoesNotThrow(()->RazorpayXPayoutWebhookService.verifySignature(body,signature,secret));
        assertThrows(RuntimeException.class,()->RazorpayXPayoutWebhookService.verifySignature("{}".getBytes(StandardCharsets.UTF_8),signature,secret));
        assertThrows(RuntimeException.class,()->RazorpayXPayoutWebhookService.verifySignature(body,"0".repeat(64),secret));
        assertThrows(RuntimeException.class,()->RazorpayXPayoutWebhookService.verifySignature(new byte[65537],signature,secret));
        assertThrows(RuntimeException.class,()->RazorpayXPayoutWebhookService.verifySignature(body,signature,""));
    }
}
