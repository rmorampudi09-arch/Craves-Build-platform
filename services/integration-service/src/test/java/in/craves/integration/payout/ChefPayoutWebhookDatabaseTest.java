package in.craves.integration.payout;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ChefPayoutWebhookDatabaseTest {
    ChefPayoutDatabaseTest fixture;RazorpayXPayoutWebhookService webhooks;ChefPayoutService.Payout payout;
    static final String SECRET="NONSECRET_CI_WEBHOOK_VALUE";
    @BeforeEach void setup() {
        fixture=new ChefPayoutDatabaseTest();fixture.setup();fixture.earning(Instant.now().minusSeconds(30));
        payout=fixture.withdraw(UUID.randomUUID(),"343.17");webhooks=new RazorpayXPayoutWebhookService(fixture.jdbc,fixture.json,SECRET);
    }
    ObjectNode body(String status) {
        var entity=fixture.json.createObjectNode().put("id","pout_original").put("fund_account_id","fa_testchef")
            .put("reference_id",payout.id().toString()).put("currency","INR").put("amount",34317).put("status",status);
        var root=fixture.json.createObjectNode().put("event","payout.updated");root.putObject("payload").putObject("payout").set("entity",entity);return root;
    }
    String sign(byte[] bytes) {
        try {var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal(bytes));}
        catch(Exception e){throw new IllegalStateException(e);}
    }
    String receive(ObjectNode body,String id) {
        byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);return fixture.tx.execute(s->webhooks.accept(bytes,sign(bytes),id));
    }
    void paid() {
        var work=fixture.claim();fixture.tx.execute(s->{fixture.service.recordOutcome(work,new RazorpayXPayoutClient.Receipt("pout_original","processed","TEST_UTR"));return null;});
    }
    @Test void signedWebhookRecoversLostProviderIdWithoutSecondPayoutPost() {
        var lost=fixture.claim();fixture.tx.execute(s->{fixture.service.uncertain(lost);return null;});assertNull(fixture.claim());
        var body=body("processed");assertEquals("RECONCILIATION_QUEUED",receive(body,"evt_recovery"));
        var work=fixture.claim();assertNotNull(work);assertEquals("pout_original",work.providerId());
        fixture.tx.execute(s->{fixture.service.recordOutcome(work,new RazorpayXPayoutClient.Receipt("pout_original","processed","TEST_UTR"));return null;});
        assertEquals("REPLAY",receive(body,"evt_recovery"));assertEquals(1,fixture.count("finance_payout_instruction"));
        assertEquals("0.00",fixture.service.balance(fixture.chef).outstanding());assertEquals(2,fixture.count("ledger_transaction"));
    }
    @Test void forgedSignaturePostsNothing() {
        byte[] bytes=body("processed").toString().getBytes(StandardCharsets.UTF_8);
        assertThrows(RuntimeException.class,()->fixture.tx.execute(s->webhooks.accept(bytes,"0".repeat(64),"evt_forged")));
        assertEquals(0,fixture.count("finance_payout_webhook_inbox"));assertEquals(1,fixture.count("ledger_transaction"));
    }
    @Test void signedAmountOrBeneficiaryMismatchDoesNotQueuePayment() {
        var amount=body("processed");((ObjectNode)amount.path("payload").path("payout").path("entity")).put("amount",34318);
        assertThrows(RuntimeException.class,()->receive(amount,"evt_wrong_amount"));
        var owner=body("processed");((ObjectNode)owner.path("payload").path("payout").path("entity")).put("fund_account_id","fa_someoneelse");
        assertThrows(RuntimeException.class,()->receive(owner,"evt_wrong_owner"));assertEquals(0,fixture.count("finance_payout_webhook_inbox"));
    }
    @Test void reusedEventWithDifferentPayloadIsConflictNotReplay() {
        receive(body("processing"),"evt_same");assertThrows(RuntimeException.class,()->receive(body("processed"),"evt_same"));
        assertEquals(1,fixture.count("finance_payout_webhook_inbox"));assertEquals(1,fixture.count("ledger_transaction"));
    }
    @Test void lateReversalPreservesPaidHistoryAndHoldsFurtherTransfers() {
        paid();assertEquals("TERMINAL_HISTORY_HELD_FOR_REVIEW",receive(body("reversed"),"evt_late_reversal"));
        assertTrue(fixture.service.balance(fixture.chef).onHold());assertEquals("PAID",fixture.service.balance(fixture.chef).recentPayouts().getFirst().status());
        assertEquals("0.00",fixture.service.balance(fixture.chef).available());assertEquals(2,fixture.count("ledger_transaction"));
    }
    @Test void outOfOrderIntermediateEventDoesNotRegressPaidOrCreateFalseHold() {
        paid();assertEquals("TERMINAL_HISTORY_PRESERVED",receive(body("queued"),"evt_late_queue"));
        assertFalse(fixture.service.balance(fixture.chef).onHold());assertEquals("PAID",fixture.service.balance(fixture.chef).recentPayouts().getFirst().status());
    }
    @Test void webhookFencesOffAnOlderWorkerLease() {
        var old=fixture.claim();receive(body("processing"),"evt_during_post");
        fixture.tx.execute(s->{fixture.service.recordOutcome(old,new RazorpayXPayoutClient.Receipt("pout_original","processed","TEST_UTR"));return null;});
        assertEquals("PROCESSING",fixture.service.balance(fixture.chef).recentPayouts().getFirst().status());
        assertNotEquals(old.leaseId(),fixture.claim().leaseId());assertEquals(1,fixture.count("ledger_transaction"));
    }
    @Test void unrelatedMerchantPayoutIsAcknowledgedWithoutChangingCraves() {
        var unrelated=body("processed");((ObjectNode)unrelated.path("payload").path("payout").path("entity")).put("reference_id","PAYROLL_OTHER_SYSTEM");
        assertEquals("IGNORED_UNRELATED_PAYOUT",receive(unrelated,"evt_other_system"));assertEquals(0,fixture.count("finance_payout_webhook_inbox"));
    }
}
