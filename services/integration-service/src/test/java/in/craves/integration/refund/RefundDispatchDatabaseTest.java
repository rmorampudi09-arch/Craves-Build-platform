package in.craves.integration.refund;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.refund.RefundModels.ProviderRefundResult;
import in.craves.integration.refund.RefundModels.RefundWorkItem;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="REFUND_TEST_JDBC_URL",matches=".+")
class RefundDispatchDatabaseTest {
    JdbcTemplate jdbc;TransactionTemplate tx;RefundRepository repository;DriverManagerDataSource ds;
    @BeforeEach void database() {
        String url=System.getenv("REFUND_TEST_JDBC_URL");
        assertEquals("true",System.getenv("CRAVES_REFUND_DISPOSABLE_DATABASE"));
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/craves_refund_test"));
        ds=new DriverManagerDataSource(url,System.getenv("REFUND_TEST_DB_USER"),System.getenv("REFUND_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);
        assertEquals("craves_refund_test",jdbc.queryForObject("SELECT current_database()",String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        migrate(null);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        repository=new RefundRepository(jdbc,new RefundStatusEventFactory(new ObjectMapper().findAndRegisterModules()));
        jdbc.update("""
            INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,
              amount,currency,status,provider,provider_order_id,provider_payment_id,checkout_key_id)
            VALUES (?,?,?,'REFUND_TEST_PAYMENT',1000,'INR','PAID','RAZORPAY','order_TestPayment','pay_TestPayment','rzp_live_UNIT_TEST')
            """,RefundTestData.ORDER,RefundTestData.CHECKOUT,RefundTestData.OWNER);
    }
    Flyway migrate(String target) {
        var config=Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .locations("classpath:db/migration");if(target!=null)config.target(target);
        var flyway=config.load();flyway.migrate();return flyway;
    }
    UUID insert(String status,int attempts,String providerId) {
        UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,reason,checkout_id,
              chef_sub_order_id,customer_identity_id,provider,provider_order_id,provider_payment_id,provider_refund_id,
              idempotency_key,request_event_id,attempt_count,provider_payload)
            VALUES (?,?,?,12.34,'INR',?,'CHEF_DECLINED',?,?,?,'RAZORPAY','order_TestPayment','pay_TestPayment',?,?,?,?,'{}')
            """,id,RefundTestData.ORDER,"CRV"+id.toString().replace("-",""),status,RefundTestData.CHECKOUT,
            UUID.randomUUID(),RefundTestData.OWNER,providerId,UUID.randomUUID(),UUID.randomUUID(),attempts);
        return id;
    }
    List<RefundWorkItem> claim(boolean create,boolean reconcile) {
        return tx.execute(s->repository.claimBatch(create,reconcile,20,8,300,UUID.randomUUID(),"RAZORPAY","PRODUCTION"));
    }
    @Test void eighteenLegacyDeadLettersCanOnlyBecomeGetLookupClaims() {
        for(int i=0;i<18;i++)insert("DEAD_LETTER",8,null);
        assertTrue(claim(true,false).isEmpty());var items=claim(false,true);assertEquals(18,items.size());
        assertTrue(items.stream().allMatch(i->i.workKind().equals("LOOKUP")&&i.attemptCount()==8&&i.priorStatus().equals("DEAD_LETTER")));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund WHERE dispatch_protocol IS NOT NULL",Integer.class));
    }
    @Test void pendingMissingIdNeverBecomesCreationUnderReconciliation() {
        insert("PENDING",1,null);var item=claim(false,true).getFirst();assertEquals("LOOKUP",item.workKind());
        assertThrows(RuntimeException.class,()->tx.execute(s->repository.prepareDispatch(item,"{}")));
    }
    @Test void knownIdRetryIsEligibleForGetWithCreationOff() {
        insert("RETRY",8,"rfnd_known");var item=claim(false,true).getFirst();assertEquals("GET",item.workKind());
    }
    @Test void freshDispatchIsCommittedAndImmutableBeforeItsCreateCall() {
        UUID id=insert("REQUESTED",0,null);var item=claim(true,false).getFirst();assertEquals("CREATE",item.workKind());
        var prepared=tx.execute(s->repository.prepareDispatch(item,"{\"amount\":1234}"));
        assertEquals(RazorpayRefundClient.hash(prepared.body()),prepared.sha256());
        assertEquals(RazorpayRefundClient.PROTOCOL,jdbc.queryForObject("SELECT dispatch_protocol FROM payment_schema.refund WHERE id=?",String.class,id));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.refund SET dispatch_request_body='changed' WHERE id=?",id));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.refund SET amount=12.35 WHERE id=?",id));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.refund SET dispatch_request_sha256=NULL WHERE id=?",id));
        UUID unprepared=insert("REQUESTED",0,null);
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.refund SET dispatch_request_body='{}' WHERE id=?",unprepared));
    }
    @Test void staleUnpreparedFirstClaimCannotBeRetrofittedAsNewSafeCreate() {
        UUID id=insert("PROCESSING",1,null);jdbc.update("UPDATE payment_schema.refund SET locked_at=now()-interval '1 hour',lock_token=? WHERE id=?",UUID.randomUUID(),id);
        assertTrue(claim(true,false).isEmpty());var item=claim(false,true).getFirst();assertEquals("LOOKUP",item.workKind());
    }
    @Test void unknownOutcomeRetainsOriginalDeadLetterAndAppendsEvidenceWithoutFalseFailure() {
        UUID id=insert("DEAD_LETTER",8,null);var item=claim(false,true).getFirst();
        assertTrue(Boolean.TRUE.equals(tx.execute(s->repository.markUnknown(item,Instant.now(),"LOOKUP_NO_MATCH",false,Instant.now()))));
        assertEquals("DEAD_LETTER",jdbc.queryForObject("SELECT status FROM payment_schema.refund WHERE id=?",String.class,id));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_recovery_observation",Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_status_outbox",Integer.class));
        assertTrue(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        assertThrows(RuntimeException.class,()->jdbc.execute("DELETE FROM payment_schema.refund_recovery_observation"));
    }
    @Test void verifiedRecoveryCorrectsFailureByAppendingOneNewEventAndCannotReplayClaim() {
        UUID id=insert("DEAD_LETTER",8,null);
        String oldKey="REFUND_STATUS_CHANGED:"+id+":REFUND_FAILED:FAILED";
        jdbc.update("""
            INSERT INTO payment_schema.refund_status_outbox(id,event_key,aggregate_id,event_type,event_version,
             correlation_id,causation_id,subject,payload,status,published_at)
            SELECT ?,?,id,'REFUND_STATUS_CHANGED','1.0',checkout_id,request_event_id,chef_sub_order_id,
              '{"data":{"status":"REFUND_FAILED"}}'::jsonb,'PUBLISHED',now() FROM payment_schema.refund WHERE id=?
            """,UUID.randomUUID(),oldKey,id);
        var item=claim(false,true).getFirst();var result=new ProviderRefundResult("SUCCESS","rfnd_recovered","{\"status\":\"processed\"}");
        assertTrue(Boolean.TRUE.equals(tx.execute(s->repository.applyProviderResult(item,result,"SUCCESS","REFUNDED",Instant.now(),Instant.now()))));
        assertFalse(Boolean.TRUE.equals(tx.execute(s->repository.applyProviderResult(item,result,"SUCCESS","REFUNDED",Instant.now(),Instant.now()))));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_status_outbox",Integer.class));
        assertEquals("PUBLISHED",jdbc.queryForObject("SELECT status FROM payment_schema.refund_status_outbox WHERE event_key=?",String.class,oldKey));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_recovery_observation",Integer.class));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.refund SET provider_refund_id='rfnd_other' WHERE id=?",id));
    }
    @Test void staleClaimCannotWriteEvidenceOrCorrectProjection() {
        UUID id=insert("PENDING",1,"rfnd_known");var item=claim(false,true).getFirst();
        jdbc.update("UPDATE payment_schema.refund SET lock_token=? WHERE id=?",UUID.randomUUID(),id);
        assertFalse(Boolean.TRUE.equals(tx.execute(s->repository.applyProviderResult(item,new ProviderRefundResult("SUCCESS","rfnd_known","{}"),"SUCCESS","REFUNDED",Instant.now(),Instant.now()))));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_recovery_observation",Integer.class));
    }
    @Test void historicalTestKeyNeverUsesLiveModeOrBlocksKnownLiveModeAsUnknown() {
        insert("DEAD_LETTER",8,null);jdbc.update("UPDATE payment_schema.payment_order SET checkout_key_id='rzp_test_UNIT_TEST'");
        assertTrue(claim(true,true).isEmpty());assertFalse(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        assertTrue(repository.hasUnknownHistoricalExposure("SANDBOX"));
    }
    @Test void inconsistentPaymentLinkIsNeverClaimed() {
        UUID id=insert("REQUESTED",0,null);jdbc.update("UPDATE payment_schema.refund SET provider_payment_id='pay_wrong' WHERE id=?",id);
        assertTrue(claim(true,true).isEmpty());
    }
    @Test void concurrentClaimsHaveNoOverlap() throws Exception {
        for(int i=0;i<10;i++)insert("REQUESTED",0,null);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->claim(true,false));var b=pool.submit(()->claim(true,false));
            var first=a.get();var second=b.get();assertEquals(10,first.size()+second.size());
            assertTrue(first.stream().noneMatch(x->second.stream().anyMatch(y->x.refundId().equals(y.refundId()))));
        }
    }
    @Test void fullMigrationChainValidatesAndReplaysWithoutEdits() {
        Flyway f=migrate(null);f.validate();assertEquals(0,f.migrate().migrationsExecuted);
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM payment_schema.flyway_schema_history WHERE version='136' AND success",Integer.class));
    }
    @Test void successfulPendingPollsBeyondAttemptBudgetStillReachConfirmedSuccess() {
        UUID id=insert("PENDING",1,"rfnd_pending");
        for(int i=0;i<12;i++) {
            var item=claim(false,true).getFirst();assertEquals("GET",item.workKind());
            assertEquals(i+1,item.reconciliationAttemptCount());
            assertTrue(Boolean.TRUE.equals(tx.execute(s->repository.applyProviderResult(item,
                new ProviderRefundResult("PENDING","rfnd_pending","{\"status\":\"pending\"}"),
                "PENDING","REFUND_PENDING",Instant.now(),Instant.now()))));
        }
        var item=claim(false,true).getFirst();assertEquals(13,item.reconciliationAttemptCount());
        assertTrue(Boolean.TRUE.equals(tx.execute(s->repository.applyProviderResult(item,
            new ProviderRefundResult("SUCCESS","rfnd_pending","{\"status\":\"processed\"}"),
            "SUCCESS","REFUNDED",Instant.now(),Instant.now()))));
        assertEquals("SUCCESS",jdbc.queryForObject("SELECT status FROM payment_schema.refund WHERE id=?",String.class,id));
        assertEquals(13,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_recovery_observation WHERE refund_id=?",Integer.class,id));
        assertEquals(0,jdbc.queryForObject("SELECT consecutive_reconciliation_failures FROM payment_schema.refund WHERE id=?",Integer.class,id));
        assertTrue(claim(false,true).isEmpty());
    }
    @Test void failedReconciliationHasVisibleBoundedBudgetAndVerifiedPendingResetsOnlyFailures() {
        UUID id=insert("PENDING",1,"rfnd_known");
        for(int i=0;i<7;i++) {
            var item=claim(false,true).getFirst();
            tx.execute(s->repository.markUnknown(item,Instant.now(),"UNKNOWN_OUTCOME",false,Instant.now()));
        }
        var success=claim(false,true).getFirst();assertEquals(7,success.consecutiveReconciliationFailures());
        tx.execute(s->repository.applyProviderResult(success,new ProviderRefundResult("PENDING","rfnd_known","{}"),
            "PENDING","REFUND_PENDING",Instant.now(),Instant.now()));
        assertEquals(0,jdbc.queryForObject("SELECT consecutive_reconciliation_failures FROM payment_schema.refund WHERE id=?",Integer.class,id));
        for(int i=0;i<8;i++) {
            var item=claim(false,true).getFirst();String kind=i==7?"RECONCILIATION_LIMIT":"UNKNOWN_OUTCOME";
            tx.execute(s->repository.markUnknown(item,Instant.now(),kind,false,Instant.now()));
        }
        assertTrue(claim(false,true).isEmpty());
        assertEquals(16,jdbc.queryForObject("SELECT reconciliation_attempt_count FROM payment_schema.refund WHERE id=?",Integer.class,id));
        assertEquals("RECONCILIATION_LIMIT",jdbc.queryForObject("SELECT last_error FROM payment_schema.refund WHERE id=?",String.class,id));
        assertTrue(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.refund SET attempt_count=0 WHERE id=?",id));
    }
    @Test void stalePreparedRetryCannotAuthorizeAnotherPostOrIncrementDispatchHistory() {
        UUID id=insert("REQUESTED",0,null);var first=claim(true,false).getFirst();
        tx.execute(s->repository.prepareDispatch(first,"{\"amount\":1234}"));
        tx.execute(s->repository.markUnknown(first,Instant.now(),"UNKNOWN_OUTCOME",true,Instant.now()));
        var retry=claim(true,false).getFirst();assertEquals(1,retry.attemptCount());
        jdbc.update("UPDATE payment_schema.refund SET lock_token=? WHERE id=?",UUID.randomUUID(),id);
        assertThrows(RuntimeException.class,()->tx.execute(s->repository.prepareDispatch(retry,"{\"amount\":1234}")));
        assertEquals(1,jdbc.queryForObject("SELECT attempt_count FROM payment_schema.refund WHERE id=?",Integer.class,id));
    }
    @Test void deferredDefinitelyUnsentReservationRemainsFreshAndRetainsObservation() {
        UUID id=insert("REQUESTED",0,null);var first=claim(true,false).getFirst();assertEquals(0,first.attemptCount());
        assertTrue(Boolean.TRUE.equals(tx.execute(s->repository.deferUnsentClaim(first,Instant.now(),Instant.now()))));
        assertEquals("REQUESTED",jdbc.queryForObject("SELECT status FROM payment_schema.refund WHERE id=?",String.class,id));
        assertEquals(0,jdbc.queryForObject("SELECT attempt_count FROM payment_schema.refund WHERE id=?",Integer.class,id));
        assertEquals("DISPATCH_DEFERRED",jdbc.queryForObject("SELECT observation_kind FROM payment_schema.refund_recovery_observation WHERE refund_id=?",String.class,id));
        assertFalse(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        var second=claim(true,false).getFirst();
        tx.execute(s->repository.prepareDispatch(second,"{\"amount\":1234}"));
        assertEquals(1,jdbc.queryForObject("SELECT attempt_count FROM payment_schema.refund WHERE id=?",Integer.class,id));
    }
}
