package in.craves.integration.referrals.checkout;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.referrals.transport.ReferralSourceClient;
import in.craves.integration.refund.*;
import in.craves.integration.refund.RefundModels.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ReferralRefundCompletionContractDatabaseTest extends ReferralCheckoutFundingDatabaseTest {
    ReferralRefundService refunds;
    ReferralSourceClient referral;
    RefundRepository repository;
    SerializedRefundOrderConsumer consumer;
    RefundWorkItem claimed;

    @BeforeEach void setupRefunds() throws Exception {
        consumer=new SerializedRefundOrderConsumer(r.db,json,r.tx);
        referral=mock(ReferralSourceClient.class);
        refunds=new ReferralRefundService(r.db,json,referral,new LedgerPostingService(r.db,json,true),r.manager);
        repository=new RefundRepository(r.db,new RefundStatusEventFactory(json)); repository.setReferralRefunds(refunds);
        reply();
        seedOrder();
    }
    void seedOrder() {
        r.db.update("INSERT INTO order_schema.checkout(id,customer_identity_id,status,currency,food_subtotal,platform_fee,tax_amount,delivery_fee,grand_total) VALUES (?,?,'PAID','INR',1000,0,0,0,1000)",checkout,buyer);
        r.db.update("INSERT INTO order_schema.customer_order(id,checkout_id,customer_identity_id,kitchen_id,chef_identity_id,status,currency,food_subtotal,platform_fee,tax_amount,delivery_fee,grand_total,chef_rejection_code,refund_requested_at,refund_requested_amount) VALUES (?,?,?,?,?,'CHEF_REJECTED','INR',1000,0,0,0,1000,'CHEF_DECLINED',now(),1000)",order,checkout,buyer,UUID.randomUUID(),UUID.randomUUID());
    }
    void reply() throws Exception { doAnswer(i->{var p=json.readTree((byte[])i.getArgument(1)).path("payload"); return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("checkoutId",p.path("checkoutId").asText()).put("version",p.path("version").intValue()).put("walletRefundedPaise",p.path("cumulativeWalletPaise").asText()).put("discountRefundedPaise",p.path("cumulativeDiscountPaise").asText())));}).when(referral).send(any(),any()); }
    void prepare(boolean walletOnly) throws Exception {
        if(walletOnly)funding.put("walletPaise","75000").put("gatewayPaise","0");
        var payment=create(); if(payment.amount().signum()>0)paid(payment.paymentOrderId()); assertTrue(service.runOne());
        request(new BigDecimal("1000.00"));
    }
    void request(BigDecimal amount) throws Exception {
        var request=new EventEnvelope<>(UUID.randomUUID(),"REFUND_REQUESTED","1.0",Instant.now(),checkout,UUID.randomUUID(),"order-service",order.toString(),new RefundRequestedData(checkout,order,buyer,amount,"INR","CHEF_DECLINED",Instant.now()));
        var source=new RefundRequestService(r.db,new RefundEventValidator()); source.setReferralRefunds(refunds);
        String raw=json.writeValueAsString(request); assertTrue(Boolean.TRUE.equals(r.tx.execute(s->source.accept(request,raw))));
    }
    void result(String status) {
        // Real claim and result persistence + factory/filter/outbox; provider transport is never called.
        claimed=r.tx.execute(s->repository.claimBatch(true,true,1,10,60,UUID.randomUUID(),"RAZORPAY","SANDBOX")).getFirst();
        String normalized=switch(status){case "SUCCESS"->"REFUNDED";case "PENDING"->"REFUND_PENDING";default->"REFUND_FAILED";};
        assertTrue(Boolean.TRUE.equals(r.tx.execute(s->repository.applyProviderResult(claimed,new ProviderRefundResult(status,"rfnd_TestOnly","{\"id\":\"rfnd_TestOnly\"}"),status,normalized,Instant.now().plusSeconds(300),Instant.now()))));
    }
    List<String> events(){return r.db.queryForList("SELECT payload::text FROM payment_schema.refund_status_outbox ORDER BY created_at,id",String.class);}
    void deliver(){for(String raw:events())consumer.accept(raw);}
    String completion(){return r.db.queryForObject("SELECT payload::text FROM payment_schema.refund_status_outbox WHERE event_key=?",String.class,"referral-refund/"+order+"/complete");}
    long notifications(){return r.db.queryForObject("SELECT count(*) FROM order_schema.notification_outbox WHERE event_type='REFUNDED'",Long.class);}
    String orderStatus(){return r.db.queryForObject("SELECT status FROM order_schema.customer_order",String.class);}
    void assertFinal(boolean walletOnly) throws Exception {
        var event=json.readTree(completion());var d=event.path("data");var c=d.path("completion");
        var output=java.nio.file.Path.of("target/refund-completion-contract");java.nio.file.Files.createDirectories(output);
        java.nio.file.Files.writeString(output.resolve(walletOnly?"wallet-only.json":"mixed.json"),completion());
        assertEquals("1.1",event.path("eventVersion").asText());assertEquals("REFUNDED",d.path("status").asText());
        assertEquals("ALL_TENDERS_RESTORED",c.path("type").asText());assertEquals(45000*(walletOnly?0:1),c.path("gatewayPaise").longValue());
        assertEquals(walletOnly?75000:30000,c.path("walletPaise").longValue());assertEquals(25000,c.path("discountPaise").longValue());
        assertEquals(1,c.path("version").intValue()); assertEquals(json.readTree(r.db.queryForObject("SELECT operation_envelope::text FROM payment_schema.referral_refund_allocation",String.class)).path("operationId"),c.path("operationId"));
        assertEquals(new BigDecimal("1000.00"),d.path("refundAmount").decimalValue().setScale(2));
        assertEquals(walletOnly?"NO_EXTERNAL_REFUND":"SUCCESS",d.path("providerStatus").asText());
        assertEquals(walletOnly?"REFERRAL_WALLET":"RAZORPAY",d.path("provider").asText());
        if(walletOnly)assertFalse(d.hasNonNull("providerRefundId"));else assertEquals("rfnd_TestOnly",d.path("providerRefundId").asText());
        assertEquals("COMPLETE",r.db.queryForObject("SELECT state FROM payment_schema.referral_refund_allocation",String.class));
        assertEquals(walletOnly?new BigDecimal("0.00"):new BigDecimal("450.00"),r.db.queryForObject("SELECT amount FROM payment_schema.refund",BigDecimal.class));
        assertTrue(consumer.accept(completion()));assertFalse(consumer.accept(completion()));assertEquals("REFUNDED",orderStatus());assertEquals(1,notifications());
        assertEquals(walletOnly?"NO_EXTERNAL_REFUND":"SUCCESS",r.db.queryForObject("SELECT refund_provider_status FROM order_schema.customer_order",String.class));
        var oldRead=consumer.readWithUnchangedAdminReader(r.db,buyer);java.nio.file.Files.writeString(output.resolve(walletOnly?"wallet-admin-read.json":"mixed-admin-read.json"),oldRead.toString());assertEquals("REFUNDED",oldRead.path("items").get(0).path("status").asText());assertEquals(walletOnly?"NO_EXTERNAL_REFUND":"SUCCESS",oldRead.path("items").get(0).path("refundProviderStatus").asText());
    }
    @Test void actualFactorySuccessIsSuppressedBeforeRestoration() throws Exception {
        prepare(false);result("SUCCESS");assertEquals(0,events().size());deliver();assertEquals(0,notifications());assertEquals("CHEF_REJECTED",orderStatus());
        assertTrue(refunds.runOne());assertFinal(false);assertEquals(1,events().size());
    }
    @Test void walletOnlyCompletionIsAcceptedWithoutInventingGatewaySuccess() throws Exception {prepare(true);assertEquals(0,events().size());assertTrue(refunds.runOne());assertFinal(true);verify(provider,never()).createOrder(anyString(),any(),anyString(),any());}
    @Test void delayedRestorationPublishesNoGrossCompletionUntilReceipt() throws Exception {
        prepare(false);result("SUCCESS");doThrow(new java.io.IOException("synthetic timeout")).when(referral).send(any(),any());
        assertTrue(refunds.runOne());deliver();assertEquals("CHEF_REJECTED",orderStatus());assertEquals(0,notifications());assertEquals(0,events().size());
        String original=r.db.queryForObject("SELECT operation_envelope::text FROM payment_schema.referral_refund_allocation",String.class);
        reply();r.db.execute("UPDATE payment_schema.referral_refund_allocation SET next_attempt_at=now()");assertTrue(refunds.runOne());assertFinal(false);
        assertEquals(original,r.db.queryForObject("SELECT operation_envelope::text FROM payment_schema.referral_refund_allocation",String.class));assertFalse(refunds.runOne());
    }
    @Test void providerFailureCannotRestoreBenefitsOrNotifyCompletion() throws Exception {prepare(false);result("FAILED");assertFalse(refunds.runOne());verifyNoInteractions(referral);deliver();assertEquals("REFUND_FAILED",orderStatus());assertEquals(0,notifications());assertEquals(new BigDecimal("1000.00"),json.readTree(events().getFirst()).path("data").path("refundAmount").decimalValue().setScale(2));}
    @Test void pendingFactoryEventUsesGrossButDoesNotComplete() throws Exception {prepare(false);result("PENDING");deliver();assertEquals("REFUND_PENDING",orderStatus());assertEquals(0,notifications());assertFalse(refunds.runOne());}
    @Test void runtimeAbsentStillSuppressesPersistedSplitProviderSuccess() throws Exception {prepare(false);repository.setReferralRefunds(null);result("SUCCESS");assertEquals(0,events().size());assertEquals("SUCCESS",r.db.queryForObject("SELECT status FROM payment_schema.refund",String.class));}
    @Test void invalidRestorationReceiptDoesNotComplete() throws Exception {prepare(true);doReturn(new ReferralSourceClient.Reply(200,"{}".getBytes())).when(referral).send(any(),any());assertTrue(refunds.runOne());assertEquals(0,events().size());assertEquals("WAITING",r.db.queryForObject("SELECT state FROM payment_schema.referral_refund_allocation",String.class));assertEquals(1,r.count("ledger_transaction"));}
    @Test void outboxFailureRollsBackCompletionLedgerAndRestorationSequence() throws Exception {
        prepare(false);result("SUCCESS");r.db.execute("CREATE FUNCTION payment_schema.reject_test_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$");
        r.db.execute("CREATE TRIGGER reject_test_completion BEFORE INSERT ON payment_schema.refund_status_outbox FOR EACH ROW EXECUTE FUNCTION payment_schema.reject_test_completion()");
        assertTrue(refunds.runOne());assertEquals("WAITING",r.db.queryForObject("SELECT state FROM payment_schema.referral_refund_allocation",String.class));assertEquals(1,r.count("ledger_transaction"));assertEquals(0,r.db.queryForObject("SELECT version FROM payment_schema.referral_refund_sequence",Integer.class));assertEquals(0,events().size());
        r.db.execute("DROP TRIGGER reject_test_completion ON payment_schema.refund_status_outbox");r.db.execute("UPDATE payment_schema.referral_refund_allocation SET next_attempt_at=now()");assertTrue(refunds.runOne());assertFinal(false);
    }
    @Test void concurrentRestorationHasOneFinalOutboxAndOneNotification() throws Exception {
        prepare(false);result("SUCCESS");var started=new CountDownLatch(1);var release=new CountDownLatch(1);
        doAnswer(i->{started.countDown();assertTrue(release.await(10,TimeUnit.SECONDS));var p=json.readTree((byte[])i.getArgument(1)).path("payload");return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("checkoutId",p.path("checkoutId").asText()).put("version",p.path("version").intValue()).put("walletRefundedPaise",p.path("cumulativeWalletPaise").asText()).put("discountRefundedPaise",p.path("cumulativeDiscountPaise").asText())));}).when(referral).send(any(),any());
        try(var pool=Executors.newFixedThreadPool(2)){var first=pool.submit(()->refunds.runOne());assertTrue(started.await(10,TimeUnit.SECONDS));try{assertFalse(pool.submit(()->refunds.runOne()).get(10,TimeUnit.SECONDS));assertEquals(0,events().size());assertEquals(0,notifications());}finally{release.countDown();}assertTrue(first.get(10,TimeUnit.SECONDS));}
        assertFinal(false);assertEquals(1,events().size());verify(referral,times(1)).send(any(),any());
    }
    @Test void concurrentDuplicateConsumerDeliveryProducesOneNotification() throws Exception {
        prepare(true);assertTrue(refunds.runOne());String raw=completion();var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)){Callable<Boolean> action=()->{start.await();return consumer.accept(raw);};var a=pool.submit(action);var b=pool.submit(action);start.countDown();assertNotEquals(a.get(10,TimeUnit.SECONDS),b.get(10,TimeUnit.SECONDS));}
        assertEquals(1,notifications());assertEquals(1,r.db.queryForObject("SELECT count(*) FROM order_schema.refund_status_inbox",Integer.class));
    }
    @Test void stalePendingCannotRegressCompletedOrder() throws Exception {
        prepare(false);result("PENDING");String pending=events().getFirst();r.db.execute("UPDATE payment_schema.refund SET next_reconciliation_at=now()");result("SUCCESS");assertTrue(refunds.runOne());assertFinal(false);assertFalse(consumer.accept(pending));assertEquals("REFUNDED",orderStatus());assertEquals(1,notifications());
    }
    @Test void ordinaryLegacyProviderEventStillAcceptedUnchanged() throws Exception {
        prepare(false);result("PENDING");var event=(ObjectNode)json.readTree(events().getFirst());event.put("eventId",UUID.randomUUID().toString());((ObjectNode)event.path("data")).put("status","REFUNDED").put("providerStatus","SUCCESS");assertTrue(consumer.accept(event.toString()));assertEquals(1,notifications());
    }
    @Test void compositeCannotChangeOrderIdentityGrossOrEligibility() throws Exception {
        prepare(true);assertTrue(refunds.runOne());String valid=completion();
        assertTrue(json.readTree(valid).path("data").path("completion").isObject(),"A composite completion requires explicit evidence");
        var checkoutChanged=(ObjectNode)json.readTree(valid);String differentCheckout=UUID.randomUUID().toString();checkoutChanged.put("correlationId",differentCheckout);((ObjectNode)checkoutChanged.path("data")).put("checkoutId",differentCheckout);assertThrows(RuntimeException.class,()->consumer.accept(checkoutChanged.toString()));
        var buyerChanged=(ObjectNode)json.readTree(valid);((ObjectNode)buyerChanged.path("data")).put("customerIdentityId",UUID.randomUUID().toString());assertThrows(RuntimeException.class,()->consumer.accept(buyerChanged.toString()));
        var changed=(ObjectNode)json.readTree(valid);((ObjectNode)changed.path("data")).put("refundAmount",new BigDecimal("1000.01"));((ObjectNode)changed.path("data").path("completion")).put("walletPaise",75001);assertThrows(RuntimeException.class,()->consumer.accept(changed.toString()));
        var reason=(ObjectNode)json.readTree(valid);((ObjectNode)reason.path("data")).put("reason","CHEF_ACCEPTANCE_TIMEOUT");assertThrows(RuntimeException.class,()->consumer.accept(reason.toString()));
        r.db.execute("UPDATE order_schema.customer_order SET status='DELIVERED',refund_requested_at=NULL");assertThrows(RuntimeException.class,()->consumer.accept(valid));assertEquals(0,notifications());assertEquals(0,r.db.queryForObject("SELECT count(*) FROM order_schema.refund_status_inbox",Integer.class));
    }
    @Test void finalReplayCannotReplacePinnedRefundIdentityOrReference() throws Exception {
        prepare(true);assertTrue(refunds.runOne());assertFinal(true);
        for(String field:List.of("refundId","refundReference")){var event=(ObjectNode)json.readTree(completion());event.put("eventId",UUID.randomUUID().toString());var data=(ObjectNode)event.path("data");data.put("updatedAt",Instant.now().plusSeconds(5).toString()).put(field,UUID.randomUUID().toString());assertThrows(RuntimeException.class,()->consumer.accept(event.toString()));}
        assertEquals(1,notifications());assertEquals(1,r.db.queryForObject("SELECT count(*) FROM order_schema.refund_status_inbox",Integer.class));
    }
    @Test void migrationUpgradePreservesLegacyRowsAndAcceptsWalletCompletion() throws Exception {
        SerializedRefundOrderConsumer.resetSchema(r.db,"33");seedOrder();
        String before=r.db.queryForObject("SELECT row_to_json(o)::text FROM order_schema.customer_order o",String.class);
        SerializedRefundOrderConsumer.upgradeSchema(r.db);
        assertEquals(before,r.db.queryForObject("SELECT row_to_json(o)::text FROM order_schema.customer_order o",String.class));
        assertEquals("34",r.db.queryForObject("SELECT version FROM order_schema.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1",String.class));
        prepare(true);assertTrue(refunds.runOne());assertFinal(true);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->r.db.execute("UPDATE order_schema.customer_order SET refund_provider=NULL"));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->r.db.execute("UPDATE order_schema.customer_order SET provider_refund_id='invented'"));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->r.db.execute("UPDATE order_schema.refund_status_inbox SET event_version='1.0'"));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->r.db.execute("UPDATE order_schema.refund_status_inbox SET payload=payload #- '{data,completion}'"));
    }
    @Test void zeroGatewayChildPreservesExternalCheckoutProviderAndCompletes() throws Exception {
        checkout=UUID.randomUUID();funding.put("checkoutId",checkout.toString()).put("walletPaise","74999").put("gatewayPaise","1");
        UUID first=UUID.fromString("00000000-0000-0000-0000-000000000001"),second=UUID.fromString("00000000-0000-0000-0000-000000000002");
        r.db.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,?::jsonb)",checkout,buyer,"a".repeat(64),"{\"total\":\"1000.00\"}");
        for(int i=0;i<2;i++)r.db.update("INSERT INTO payment_schema.finance_issued_snapshot(id,checkout_id,chef_order_id,chef_identity_id,snapshot_hash,payload) VALUES (?,?,?,?,?,?::jsonb)",UUID.randomUUID(),checkout,i==0?first:second,UUID.randomUUID(),(i==0?"c":"d").repeat(64),i==0?"{\"customerTotal\":\"400.00\",\"customerFood\":\"300.00\"}":"{\"customerTotal\":\"600.00\",\"customerFood\":\"500.00\"}");
        order=second;seedOrder();r.db.update("UPDATE order_schema.customer_order SET food_subtotal=600,grand_total=600,refund_requested_amount=600 WHERE id=?",order);
        var payment=create();assertEquals(new BigDecimal("0.01"),payment.amount());paid(payment.paymentOrderId());assertTrue(service.runOne());request(new BigDecimal("600.00"));
        assertEquals(0L,r.db.queryForObject("SELECT gateway_paise FROM payment_schema.referral_refund_allocation",Long.class));assertEquals("RAZORPAY",r.db.queryForObject("SELECT provider FROM payment_schema.refund",String.class));assertEquals(new BigDecimal("0.00"),r.db.queryForObject("SELECT amount FROM payment_schema.refund",BigDecimal.class));
        assertTrue(refunds.runOne());var event=json.readTree(completion());assertEquals("RAZORPAY",event.path("data").path("provider").asText());assertEquals("NO_EXTERNAL_REFUND",event.path("data").path("providerStatus").asText());assertFalse(event.path("data").hasNonNull("providerRefundId"));
        assertTrue(consumer.accept(completion()));assertFalse(consumer.accept(completion()));assertEquals("REFUNDED",r.db.queryForObject("SELECT status FROM order_schema.customer_order WHERE id=?",String.class,order));assertEquals(1,notifications());
        var output=java.nio.file.Path.of("target/refund-completion-contract");java.nio.file.Files.createDirectories(output);java.nio.file.Files.writeString(output.resolve("zero-gateway-child.json"),completion());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings={"missingId","noncanonicalStatus","cashfreeAliasMismatch"})
    void incompleteHistoricalGatewayEvidenceCannotBecomeImmutableCompletion(String invalid) throws Exception {
        prepare(false);
        // Seed incomplete historical evidence before any provider identity is bound; never disable immutability guards.
        switch(invalid){case "missingId"->r.db.execute("UPDATE payment_schema.refund SET status='SUCCESS',provider_status='SUCCESS'");case "noncanonicalStatus"->r.db.execute("UPDATE payment_schema.refund SET status='SUCCESS',provider_status='processed',provider_refund_id='rfnd_TestOnly'");case "cashfreeAliasMismatch"->r.db.execute("UPDATE payment_schema.refund SET status='SUCCESS',provider_status='SUCCESS',provider='CASHFREE',provider_refund_id='rfnd_TestOnly',cf_refund_id='DIFFERENT'");default->throw new AssertionError();}
        assertTrue(refunds.runOne());assertEquals("WAITING",r.db.queryForObject("SELECT state FROM payment_schema.referral_refund_allocation",String.class));assertEquals(1,r.count("ledger_transaction"));assertEquals(0,events().size());assertEquals(0,notifications());
    }
    @Test void expiredLeaseCompletionCannotDuplicateReplacementWorkerCompletion() throws Exception {
        prepare(false);result("SUCCESS");var started=new CountDownLatch(1);var release=new CountDownLatch(1);var calls=new java.util.concurrent.atomic.AtomicInteger();
        doAnswer(i->{if(calls.incrementAndGet()==1){started.countDown();assertTrue(release.await(10,TimeUnit.SECONDS));}var p=json.readTree((byte[])i.getArgument(1)).path("payload");return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("checkoutId",p.path("checkoutId").asText()).put("version",p.path("version").intValue()).put("walletRefundedPaise",p.path("cumulativeWalletPaise").asText()).put("discountRefundedPaise",p.path("cumulativeDiscountPaise").asText())));}).when(referral).send(any(),any());
        try(var pool=Executors.newFixedThreadPool(2)){var original=pool.submit(()->refunds.runOne());assertTrue(started.await(10,TimeUnit.SECONDS));try{r.db.execute("UPDATE payment_schema.referral_refund_allocation SET lease_until=now()-interval '1 second'");assertTrue(pool.submit(()->refunds.runOne()).get(10,TimeUnit.SECONDS));assertEquals(1,events().size());}finally{release.countDown();}assertTrue(original.get(10,TimeUnit.SECONDS));}
        assertFinal(false);assertEquals(1,events().size());assertEquals(2,r.count("ledger_transaction"));
    }

    @Test void migrationUpgradeDoesNotRewriteLegacyInboxHistoryOrNotifications() throws Exception {
        SerializedRefundOrderConsumer.resetSchema(r.db,"33");seedOrder();prepare(false);result("PENDING");deliver();
        var tables=List.of("customer_order","refund_status_inbox","notification_outbox","order_status_history");var before=new LinkedHashMap<String,String>();
        for(String table:tables)before.put(table,r.db.queryForObject("SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text FROM order_schema."+table+" t",String.class));
        SerializedRefundOrderConsumer.upgradeSchema(r.db);
        for(String table:tables)assertEquals(before.get(table),r.db.queryForObject("SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text FROM order_schema."+table+" t",String.class));
        r.db.execute("UPDATE payment_schema.refund SET next_reconciliation_at=now()");result("SUCCESS");assertTrue(refunds.runOne());assertFinal(false);
    }

}
