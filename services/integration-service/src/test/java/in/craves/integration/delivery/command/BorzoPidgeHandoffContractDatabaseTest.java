package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.*;
import in.craves.integration.delivery.*;
import in.craves.integration.delivery.command.DeliveryCommandModels.*;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.UUID;
import java.util.List;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.NullSource;
import java.math.BigDecimal;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="OF02_TEST_JDBC_URL",matches=".+")
class BorzoPidgeHandoffContractDatabaseTest {
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules()
        .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    HandoffContractDatabase r;
    SerializedDeliveryOrderConsumer consumer;
    BorzoPidgeHandoffRepository handoffs;
    BorzoPidgeHandoffCompletionService completion;
    UUID checkout,order,buyer,assignment,job;
    Instant initialAt;
    String borzoId,pidgeId;

    @BeforeEach void setup() throws Exception {
        SerializedDeliveryOrderConsumer.compile();
        r=new HandoffContractDatabase();
        SerializedDeliveryOrderConsumer.migrate(r.db);
        consumer=new SerializedDeliveryOrderConsumer(r.db,json,r.tx);
        handoffs=new BorzoPidgeHandoffRepository(r.db);
        completion=HandoffContractDatabase.transactional(new BorzoPidgeHandoffCompletionService(new DeliveryJobRepository(r.db,json),
            new DeliveryAssignmentRepository(r.db,new DeliveryJsonSupport(json)),handoffs,
            new DeliveryOutboxRepository(r.db,json),json),r.tx.getTransactionManager());
        checkout=UUID.randomUUID(); order=UUID.randomUUID(); buyer=UUID.randomUUID();
        assignment=UUID.randomUUID(); job=UUID.randomUUID(); initialAt=Instant.now().minusSeconds(300);
        borzoId="borzo-test-"+job; pidgeId="pidge-test-"+job;
        r.db.update("INSERT INTO order_schema.checkout(id,customer_identity_id,status,currency,food_subtotal,platform_fee,tax_amount,delivery_fee,grand_total) VALUES (?,?,'PAID','INR',1000,0,0,0,1000)",checkout,buyer);
        r.db.update("INSERT INTO order_schema.customer_order(id,checkout_id,customer_identity_id,kitchen_id,chef_identity_id,status,currency,food_subtotal,platform_fee,tax_amount,delivery_fee,grand_total,accepted_at,prep_time_minutes,ready_at) VALUES (?,?,?,?,?,'CHEF_ACCEPTED','INR',1000,0,0,0,1000,now(),30,now()+interval '30 minutes')",order,checkout,buyer,UUID.randomUUID(),UUID.randomUUID());
        r.db.update("INSERT INTO delivery_schema.delivery_assignment(id,chef_sub_order_id,order_id,strategy,status,scoring_version,selected_provider_id,request_context) VALUES (?,?,?,'GREEDY','ASSIGNED','test-only','borzo','{}')",assignment,order,checkout);
        r.db.update("INSERT INTO delivery_schema.delivery_job(id,chef_sub_order_id,order_id,assignment_id,provider_id,provider_delivery_id,status,last_status_observed_at,last_status_source) VALUES (?,?,?,?,'borzo',?,'SEARCHING',?,'CREATE')",job,order,checkout,assignment,borzoId,java.sql.Timestamp.from(initialAt));
        handoffs.enroll(job,borzoId,initialAt);
        r.db.update("UPDATE delivery_schema.delivery_borzo_pidge_handoff SET state='PROCESSING_PIDGE',borzo_cancel_intent_at=now()-interval '2 seconds',borzo_cancelled_at=now()-interval '1 second' WHERE delivery_job_id=?",job);
    }
    String initial() throws Exception {
        String raw=json.writeValueAsString(new EventEnvelope<>(UUID.randomUUID(),"DELIVERY_STATUS_CHANGED","1.0",initialAt,checkout,null,"integration-service","delivery-job/"+job,
            new DeliveryStatusChangedData(job,checkout,order,"borzo",borzoId,"SEARCHING",null,initialAt)));
        writeFixture("ordinary-borzo.json",raw);
        return raw;
    }
    String complete() { return complete(DeliveryStatus.SEARCHING); }
    String complete(DeliveryStatus status) {return complete(status,new BigDecimal("25.00"));}
    String complete(DeliveryStatus status,BigDecimal fee) {
        // Confirmed provider response is a local value; no provider or network transport is invoked.
        ProviderDelivery confirmed=new ProviderDelivery("pidge",pidgeId,null,status,status.name(),null,fee,null,null,Instant.now());
        completion.complete(handoffs.findByDeliveryJobId(job).orElseThrow(),confirmed);
        return r.db.queryForObject("SELECT payload::text FROM delivery_schema.delivery_outbox WHERE aggregate_id=?",String.class,job);
    }
    @Test void confirmedProducerEventRebindsBorzoToPidgeAtUnchangedSearchingStatus() throws Exception {
        assertTrue(consumer.accept(initial()).applied());
        String raw=complete();
        var output=Path.of("target/handoff-contract");Files.createDirectories(output);Files.writeString(output.resolve("confirmed-handoff.json"),raw);
        assertEquals("COMPLETED",r.db.queryForObject("SELECT state FROM delivery_schema.delivery_borzo_pidge_handoff",String.class));
        assertTrue(consumer.accept(raw).applied());
        assertEquals("pidge",r.db.queryForObject("SELECT delivery_provider_id FROM order_schema.customer_order",String.class));
        assertEquals(pidgeId,r.db.queryForObject("SELECT delivery_provider_delivery_id FROM order_schema.customer_order",String.class));
        assertEquals("CHEF_ACCEPTED",r.db.queryForObject("SELECT status FROM order_schema.customer_order",String.class));
    }
    String continuation(DeliveryStatus status) throws Exception {
        var source=new in.craves.integration.delivery.status.DeliveryStatusUpdateService(List.of(),
            new DeliveryStatusRepository(r.db,json),new DeliveryOutboxRepository(r.db,json),
            new DeliveryCommandProperties(),json,handoffs);
        Instant observed=r.db.queryForObject("SELECT last_status_observed_at FROM delivery_schema.delivery_job WHERE id=?",java.sql.Timestamp.class,job).toInstant().plusSeconds(1);
        var confirmed=new ProviderDelivery("pidge",pidgeId,null,status,status.name(),null,new java.math.BigDecimal("25.00"),null,null,observed);
        var result=r.tx.execute(t->source.processTracking(new DeliveryStatusRepository.TrackingWorkItem(job,checkout,order,"pidge",pidgeId,1),new TrackingSnapshot(confirmed,null,observed)));
        assertTrue(result.applied());
        String raw=r.db.queryForObject("SELECT payload::text FROM delivery_schema.delivery_outbox WHERE aggregate_id=? AND payload->'data'->>'status'=?",String.class,job,status.name());
        assertTrue(json.readTree(raw).path("data").path("handoffContinuation").asBoolean());
        writeFixture("pidge-continuation.json",raw);
        return raw;
    }
    static void writeFixture(String name,String raw) throws Exception {
        var output=Path.of("target/handoff-contract");Files.createDirectories(output);
        Files.writeString(output.resolve(name),raw);
    }
    String mutate(String raw, String field, String value) throws Exception {
        ObjectNode node=(ObjectNode)json.readTree(raw);
        if(field.startsWith("data.")) ((ObjectNode)node.get("data")).put(field.substring(5),value);
        else node.put(field,value);
        return node.toString();
    }
    String projection() {
        return r.db.queryForObject("SELECT row_to_json(o)::text FROM order_schema.customer_order o WHERE id=?",String.class,order);
    }
    long count(String table) {return r.db.queryForObject("SELECT count(*) FROM "+table,Long.class);}
    RuntimeException assertRejectedWithoutMutation(String raw) {
        String before=projection();
        long inbox=count("order_schema.delivery_status_inbox"),history=count("order_schema.order_delivery_status_history"),notifications=count("order_schema.notification_outbox");
        RuntimeException failure=assertThrows(RuntimeException.class,()->consumer.accept(raw));
        assertEquals(before,projection());
        assertEquals(inbox,count("order_schema.delivery_status_inbox"));
        assertEquals(history,count("order_schema.order_delivery_status_history"));
        assertEquals(notifications,count("order_schema.notification_outbox"));
        return failure;
    }
    void assertRejection(String raw,String message) {
        assertEquals(message,assertRejectedWithoutMutation(raw).getMessage());
    }
    @Test void laterPidgeContinuationAndReplayPreserveSingleBindingAndNotification() throws Exception {
        String initial=initial();assertTrue(consumer.accept(initial).applied());
        String handoff=complete();assertTrue(consumer.accept(handoff).applied());
        String next=continuation(DeliveryStatus.COURIER_ASSIGNED);assertTrue(consumer.accept(next).applied());
        String current=projection();
        assertTrue(consumer.accept(initial).duplicate());assertTrue(consumer.accept(handoff).duplicate());assertTrue(consumer.accept(next).duplicate());
        assertEquals(current,projection());assertEquals(3,count("order_schema.order_delivery_status_history"));
        assertEquals(1,count("order_schema.notification_outbox"));
    }
    @Test void continuationArrivingBeforeOriginalHandoffCanEstablishProvenBinding() throws Exception {
        assertTrue(consumer.accept(initial()).applied());
        String handoff=complete(),next=continuation(DeliveryStatus.COURIER_ASSIGNED);
        assertTrue(consumer.accept(next).applied());
        String current=projection();
        assertFalse(consumer.accept(handoff).applied());
        assertEquals(current,projection());
        assertEquals(pidgeId,r.db.queryForObject("SELECT delivery_provider_delivery_id FROM order_schema.customer_order",String.class));
        assertEquals(1,count("order_schema.notification_outbox"));
    }
    @Test void forgedSwitchCannotRebindFromSelfAssertedHandoffMetadata() throws Exception {
        assertTrue(consumer.accept(initial()).applied());
        String real=complete();
        assertRejection(mutate(real,"eventId",UUID.randomUUID().toString()),"Delivery handoff does not match committed evidence");
        assertRejection(mutate(real,"source","forged-source"),"Unexpected delivery status event source");
        assertRejection(mutate(real,"data.handoffFromProviderId","pidge"),"Unsupported delivery handoff provenance");
        assertRejection(mutate(real,"data.handoffFromProviderDeliveryId","wrong-borzo"),"Delivery handoff binding does not match the chef sub-order");
        assertRejection(mutate(real,"data.providerDeliveryId","wrong-pidge"),"Delivery handoff does not match committed evidence");
        assertRejection(mutate(real,"data.providerId","shadowfax"),"Unsupported delivery handoff provenance");
        assertRejection(mutate(real,"data.status","DELIVERED"),"Delivery handoff does not match committed evidence");
        assertRejection(mutate(real,"data.trackingUrl","https://example.invalid/forged"),"Delivery handoff does not match committed evidence");
        ObjectNode unknown=(ObjectNode)json.readTree(real);UUID wrong=UUID.randomUUID();
        unknown.put("subject","delivery-job/"+wrong);((ObjectNode)unknown.get("data")).put("deliveryJobId",wrong.toString());
        assertRejection(unknown.toString(),"Delivery job identifier changed for the chef sub-order");
        ObjectNode otherCheckout=(ObjectNode)json.readTree(real);UUID checkoutWrong=UUID.randomUUID();
        otherCheckout.put("correlationId",checkoutWrong.toString());((ObjectNode)otherCheckout.get("data")).put("orderId",checkoutWrong.toString());
        assertRejection(otherCheckout.toString(),"Delivery checkout does not match the chef sub-order");
        assertTrue(consumer.accept(real).applied());
    }
    @Test void missingHandoffMetadataCannotAuthorizeAProviderSwitch() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        ObjectNode fake=(ObjectNode)json.readTree(real);
        ((ObjectNode)fake.get("data")).remove(List.of("handoffFromProviderId","handoffFromProviderDeliveryId","handoffContinuation"));
        assertRejection(fake.toString(),"Delivery provider changed for the chef sub-order");
    }
    @ParameterizedTest @ValueSource(strings={"CHEF_ACCEPTED","PREPARING"})
    void providerHandoffNeverAdvancesEarlyCommercialOrderState(String commercial) throws Exception {
        r.db.update("UPDATE order_schema.customer_order SET status=?",commercial);
        assertTrue(consumer.accept(initial()).applied());assertTrue(consumer.accept(complete()).applied());
        assertTrue(consumer.accept(continuation(DeliveryStatus.PICKED_UP)).applied());
        assertTrue(consumer.accept(continuation(DeliveryStatus.DELIVERED)).applied());
        assertEquals(commercial,r.db.queryForObject("SELECT status FROM order_schema.customer_order",String.class));
        assertEquals(0,count("order_schema.order_status_history"));
    }
    @ParameterizedTest @ValueSource(strings={"CHEF_REJECTED","CANCELLED","REFUND_PENDING","REFUNDED","REFUND_FAILED"})
    void commercialCancellationOrRefundCannotBeReopenedByProvenHandoff(String terminal) throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        r.db.update("UPDATE order_schema.customer_order SET status=?",terminal);
        assertRejection(real,"Order is not eligible for delivery status updates");
    }
    @Test void persistedRefundRequestCannotBeReopenedByProvenHandoff() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        r.db.execute("UPDATE order_schema.customer_order SET status='CHEF_REJECTED',refund_requested_at=now(),refund_requested_amount=1000,chef_rejection_code='CHEF_DECLINED'");
        assertRejection(real,"Order is not eligible for delivery status updates");
    }
    @Test void lateBorzoEventAfterHandoffCannotRestoreOldProviderOrRegressDelivery() throws Exception {
        assertTrue(consumer.accept(initial()).applied());assertTrue(consumer.accept(complete()).applied());
        assertTrue(consumer.accept(continuation(DeliveryStatus.COURIER_ASSIGNED)).applied());
        String late=mutate(initial(),"data.observedAt",Instant.now().plusSeconds(60).toString());
        assertRejection(late,"Delivery provider changed for the chef sub-order");
    }
    @ParameterizedTest @NullSource @ValueSource(strings={"25.00"})
    void handoffProducerFailureRollsBackJobAssignmentJournalAndOutbox(String feeText) throws Exception {
        BigDecimal fee=feeText==null?null:new BigDecimal(feeText);
        String before=r.db.queryForObject("SELECT row_to_json(j)::text FROM delivery_schema.delivery_job j",String.class);
        String assignmentBefore=r.db.queryForObject("SELECT row_to_json(a)::text FROM delivery_schema.delivery_assignment a",String.class);
        String journalBefore=r.db.queryForObject("SELECT row_to_json(h)::text FROM delivery_schema.delivery_borzo_pidge_handoff h",String.class);
        r.db.execute("CREATE FUNCTION delivery_schema.reject_test_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$");
        r.db.execute("CREATE TRIGGER reject_test_handoff BEFORE INSERT ON delivery_schema.delivery_outbox FOR EACH ROW EXECUTE FUNCTION delivery_schema.reject_test_handoff()");
        assertThrows(RuntimeException.class,()->complete(DeliveryStatus.SEARCHING,fee));
        assertEquals(before,r.db.queryForObject("SELECT row_to_json(j)::text FROM delivery_schema.delivery_job j",String.class));
        assertEquals(assignmentBefore,r.db.queryForObject("SELECT row_to_json(a)::text FROM delivery_schema.delivery_assignment a",String.class));
        assertEquals(journalBefore,r.db.queryForObject("SELECT row_to_json(h)::text FROM delivery_schema.delivery_borzo_pidge_handoff h",String.class));
        assertEquals(0,count("delivery_schema.delivery_outbox"));
        r.db.execute("DROP TRIGGER reject_test_handoff ON delivery_schema.delivery_outbox");
        assertTrue(consumer.accept(initial()).applied());assertTrue(consumer.accept(complete(DeliveryStatus.SEARCHING,fee)).applied());
    }
    @Test void consumerOutboxFailureRollsBackRebindingInboxAndHistoryThenAllowsRetry() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete(DeliveryStatus.COURIER_ASSIGNED);
        r.db.execute("CREATE FUNCTION order_schema.reject_test_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic notification failure'; END $$");
        r.db.execute("CREATE TRIGGER reject_test_notification BEFORE INSERT ON order_schema.notification_outbox FOR EACH ROW EXECUTE FUNCTION order_schema.reject_test_notification()");
        assertRejectedWithoutMutation(real);
        assertEquals(1,count("delivery_schema.delivery_outbox"));
        r.db.execute("DROP TRIGGER reject_test_notification ON order_schema.notification_outbox");
        assertTrue(consumer.accept(real).applied());assertTrue(consumer.accept(real).duplicate());
        assertEquals(1,count("order_schema.notification_outbox"));
    }

    @Test void proofDependencyFailureIsRetryableAndDoesNotConsumeEvent() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        consumer.proofResponseStatus.set(503);
        assertRejection(real,"Delivery handoff proof is temporarily unavailable");
        consumer.proofResponseStatus.set(200);
        assertTrue(consumer.accept(real).applied());
        assertEquals(2,consumer.proofRequests.get());
    }
    @Test void handoffBeforeInitialBorzoBindingIsRetryableWithoutConsumingEvent() throws Exception {
        String real=complete();
        assertRejection(real,"Original delivery binding is not available yet");
        assertEquals(0,consumer.proofRequests.get());
        assertTrue(consumer.accept(initial()).applied());assertTrue(consumer.accept(real).applied());
    }
    @Test void committedJournalAndCurrentJobMustConfirmExactOldAndNewIdentities() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        String[] invalidUpdates={
            "state='PROCESSING_PIDGE'",
            "state='WAITING'",
            "state='RETAINED_BORZO'",
            "state='MANUAL_REVIEW'",
            "borzo_cancel_intent_at=NULL",
            "borzo_cancelled_at=NULL",
            "completed_at=NULL",
            "borzo_cancel_intent_at=now()+interval '1 day'",
            "borzo_provider_delivery_id='wrong-old-provider-id'",
            "pidge_provider_delivery_id='wrong-new-provider-id'"
        };
        var journal=r.db.queryForMap("SELECT borzo_cancel_intent_at,borzo_cancelled_at,completed_at FROM delivery_schema.delivery_borzo_pidge_handoff");
        for(String update:invalidUpdates) {
            r.db.execute("UPDATE delivery_schema.delivery_borzo_pidge_handoff SET "+update);
            assertRejection(real,"Delivery handoff does not match committed evidence");
            r.db.update("UPDATE delivery_schema.delivery_borzo_pidge_handoff SET state='COMPLETED',borzo_cancel_intent_at=?,borzo_cancelled_at=?,completed_at=?,borzo_provider_delivery_id=?,pidge_provider_delivery_id=?",
                journal.get("borzo_cancel_intent_at"),journal.get("borzo_cancelled_at"),journal.get("completed_at"),borzoId,pidgeId);
        }
        for(String update:List.of("provider_delivery_id='wrong-current-pidge'",
            "order_id='"+UUID.randomUUID()+"'", "chef_sub_order_id='"+UUID.randomUUID()+"'")) {
            r.db.execute("UPDATE delivery_schema.delivery_job SET "+update);
            assertRejection(real,"Delivery handoff does not match committed evidence");
            r.db.update("UPDATE delivery_schema.delivery_job SET provider_delivery_id=?,order_id=?,chef_sub_order_id=?",pidgeId,checkout,order);
        }
        assertTrue(consumer.accept(real).applied());
    }
    @Test void duplicatedPersistedEventIdentityCannotServeAsUniqueHandoffProof() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        UUID duplicate=new DeliveryOutboxRepository(r.db,json).enqueue("DELIVERY_STATUS_CHANGED",job,checkout,json.readTree(real));
        assertRejection(real,"Delivery handoff does not match committed evidence");
        r.db.update("DELETE FROM delivery_schema.delivery_outbox WHERE id=?",duplicate);
        assertTrue(consumer.accept(real).applied());
    }
    @ParameterizedTest @ValueSource(strings={"COURIER_ASSIGNED","PICKED_UP","DELIVERED","CANCELLED","RETURNED","FAILED"})
    void provenHandoffCannotReplaceAlreadyAcceptedOrTerminalBorzoBinding(String status) throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        r.db.update("UPDATE order_schema.customer_order SET delivery_status=?",status);
        assertRejection(real,"Original delivery is not eligible for handoff");
    }
    @Test void staleConfirmedHandoffCannotOverwriteNewerObservation() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        r.db.execute("UPDATE order_schema.customer_order SET delivery_status_observed_at=now()+interval '1 day'");
        String before=projection();
        var result=consumer.accept(real);
        assertFalse(result.applied());assertEquals("STALE",result.result());
        assertEquals(before,projection());
        assertEquals(1,count("order_schema.order_delivery_status_history"));
    }

    @Test void uncommittedProducerOutboxCannotAuthorizeHandoffUntilCommit() throws Exception {
        assertTrue(consumer.accept(initial()).applied());
        String real=r.tx.execute(t->{
            String pending=complete();
            var attempt=java.util.concurrent.CompletableFuture.supplyAsync(()->consumer.accept(pending));
            assertThrows(java.util.concurrent.ExecutionException.class,()->attempt.get(10,java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("borzo",r.db.queryForObject("SELECT delivery_provider_id FROM order_schema.customer_order",String.class));
            assertEquals(1,count("order_schema.delivery_status_inbox"));
            return pending;
        });
        assertTrue(consumer.accept(real).applied());
    }
    @Test void pinnedPidgeContinuationKeepsStrictIdentityWithoutRequiringAnotherProof() throws Exception {
        assertTrue(consumer.accept(initial()).applied());assertTrue(consumer.accept(complete()).applied());
        String next=continuation(DeliveryStatus.COURIER_ASSIGNED);
        assertRejection(mutate(next,"data.providerDeliveryId","different-pidge"),"Delivery handoff binding does not match the chef sub-order");
        assertEquals(1,consumer.proofRequests.get());
        consumer.proofResponseStatus.set(503);
        assertTrue(consumer.accept(next).applied());
        assertEquals(1,consumer.proofRequests.get(),"Pinned provider updates must not depend on proof availability");
    }
    @Test void concurrentDuplicateDeliveryMakesOneRebindingHistoryEntry() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete(DeliveryStatus.COURIER_ASSIGNED);
        var start=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<SerializedDeliveryOrderConsumer.Result> action=()->{start.await();return consumer.accept(real);};
            var a=pool.submit(action);var b=pool.submit(action);start.countDown();
            var first=a.get(10,java.util.concurrent.TimeUnit.SECONDS);var second=b.get(10,java.util.concurrent.TimeUnit.SECONDS);
            assertNotEquals(first.applied(),second.applied());assertNotEquals(first.duplicate(),second.duplicate());
        }
        assertEquals(2,count("order_schema.order_delivery_status_history"));
        assertEquals(2,count("order_schema.delivery_status_inbox"));
        assertEquals(1,count("order_schema.notification_outbox"));
    }

    @Test void malformedProvenanceNeverAuthorizesAProviderChange() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        for(String field:List.of("handoffFromProviderId","handoffFromProviderDeliveryId")) {
            ObjectNode invalid=(ObjectNode)json.readTree(real);((ObjectNode)invalid.get("data")).remove(field);
            assertRejection(invalid.toString(),"Unsupported delivery handoff provenance");
            assertRejection(mutate(real,"data."+field,""),"Unsupported delivery handoff provenance");
        }
        ObjectNode falseContinuation=(ObjectNode)json.readTree(real);
        ((ObjectNode)falseContinuation.get("data")).put("handoffContinuation",false);
        assertRejection(falseContinuation.toString(),"Unsupported delivery handoff provenance");
        assertTrue(consumer.accept(real).applied());
    }
    @Test void ordinaryEventsRetainStrictJobProviderAndProviderDeliveryBinding() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String ordinary=initial();
        assertRejection(mutate(ordinary,"data.providerId","pidge"),"Delivery provider changed for the chef sub-order");
        assertRejection(mutate(ordinary,"data.providerDeliveryId","other-borzo"),"Provider delivery identifier changed for the chef sub-order");
        assertEquals(0,consumer.proofRequests.get());
    }

    @Test void proofQueryLockTimeoutRollsBackProjectionAndRestoresConnectionSettings() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        try(var blocker=r.db.getDataSource().getConnection()) {
            blocker.setAutoCommit(false);
            try(var statement=blocker.createStatement()) {statement.execute("LOCK TABLE delivery_schema.delivery_outbox IN ACCESS EXCLUSIVE MODE");}
            long started=System.nanoTime();
            assertRejection(real,"Delivery handoff proof is temporarily unavailable");
            long elapsed=java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started);
            assertTrue(elapsed>=2000 && elapsed<10000,"Proof query must have a bounded deadline, actual ms="+elapsed);
            assertEquals("0",consumer.releasedProofStatementTimeout.get(),"SET LOCAL must be restored on the same connection before release");
            blocker.rollback();
        }
        assertTrue(consumer.accept(real).applied());
        assertEquals("0",consumer.releasedProofStatementTimeout.get());
    }
    @Test void refundCommittedWhileConsumerWaitsForOrderRowCannotBeOverwritten() throws Exception {
        assertTrue(consumer.accept(initial()).applied());String real=complete();
        try(var blocker=r.db.getDataSource().getConnection()) {
            blocker.setAutoCommit(false);
            try(var statement=blocker.prepareStatement("UPDATE order_schema.customer_order SET status='REFUND_PENDING',refund_requested_at=now(),refund_requested_amount=1000,chef_rejection_code='CHEF_DECLINED' WHERE id=?")) {
                statement.setObject(1,order);assertEquals(1,statement.executeUpdate());
            }
            var pending=java.util.concurrent.CompletableFuture.supplyAsync(()->consumer.accept(real));
            long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(10);
            boolean waiting=false;
            while(System.nanoTime()<deadline && !pending.isDone()) {
                waiting=r.db.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM order_schema.customer_order%' AND query LIKE '%FOR UPDATE%')",Boolean.class);
                if(waiting)break;
                Thread.sleep(20);
            }
            assertTrue(waiting,"Consumer must actually wait on the locked Order row before committing the refund");
            blocker.commit();
            String refunded=projection();
            var failed=assertThrows(java.util.concurrent.ExecutionException.class,()->pending.get(10,java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("Order is not eligible for delivery status updates",failed.getCause().getMessage());
            assertEquals(refunded,projection());
            assertEquals(1,count("order_schema.delivery_status_inbox"));
            assertEquals(1,count("order_schema.order_delivery_status_history"));
            assertEquals(0,count("order_schema.notification_outbox"));
        }
    }

    @ParameterizedTest @NullSource @ValueSource(strings={"0.00","25.75","-2.50"})
    void nullablePidgeFeePreservesProducerAndConsumerSemantics(String feeText) throws Exception {
        BigDecimal fee=feeText==null?null:new BigDecimal(feeText);
        JsonNode previousRouting=json.readTree(r.db.queryForObject("SELECT quote_snapshot::text FROM delivery_schema.delivery_job",String.class));
        assertTrue(consumer.accept(initial()).applied());
        String raw=complete(DeliveryStatus.SEARCHING,fee);
        var persisted=r.db.queryForMap("SELECT id,chef_sub_order_id,order_id,assignment_id,provider_id,provider_delivery_id,quote_snapshot::text FROM delivery_schema.delivery_job");
        assertEquals(job,persisted.get("id"));assertEquals(order,persisted.get("chef_sub_order_id"));
        assertEquals(checkout,persisted.get("order_id"));assertEquals(assignment,persisted.get("assignment_id"));
        assertEquals("pidge",persisted.get("provider_id"));assertEquals(pidgeId,persisted.get("provider_delivery_id"));
        JsonNode quote=json.readTree((String)persisted.get("quote_snapshot"));
        assertEquals(previousRouting,quote.get("previousRouting"));
        assertEquals("pidge",quote.path("selectedProviderId").asText());
        assertEquals("borzo",quote.path("handoffFromProviderId").asText());
        assertEquals(borzoId,quote.path("handoffFromProviderDeliveryId").asText());
        assertEquals(pidgeId,quote.path("pidgeProviderDeliveryId").asText());
        assertTrue(quote.has("pidgeDeliveryFee"));
        if(fee==null) assertTrue(quote.get("pidgeDeliveryFee").isNull());
        else assertEquals(0,fee.compareTo(quote.get("pidgeDeliveryFee").decimalValue()));
        assertEquals("pidge",r.db.queryForObject("SELECT selected_provider_id FROM delivery_schema.delivery_assignment",String.class));
        assertEquals("COMPLETED",r.db.queryForObject("SELECT state FROM delivery_schema.delivery_borzo_pidge_handoff",String.class));
        assertEquals(1,count("delivery_schema.delivery_outbox"));
        assertTrue(consumer.accept(raw).applied());
        assertEquals("pidge",r.db.queryForObject("SELECT delivery_provider_id FROM order_schema.customer_order",String.class));
        assertEquals(pidgeId,r.db.queryForObject("SELECT delivery_provider_delivery_id FROM order_schema.customer_order",String.class));
        assertEquals("CHEF_ACCEPTED",r.db.queryForObject("SELECT status FROM order_schema.customer_order",String.class));
        assertEquals(2,count("order_schema.order_delivery_status_history"));
        assertEquals(0,count("order_schema.notification_outbox"));
    }
}
