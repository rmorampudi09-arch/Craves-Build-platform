package in.craves.referral;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.referral.core.ReferralCodes;
import in.craves.referral.infra.InboxService;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.SourceEventRouter;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static in.craves.referral.infra.Store.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Fault and concurrency tests against disposable PostgreSQL; no production owners/providers. */
class ReferralResilienceIT {
    ReferralTestRig r;
    @BeforeEach void setup() { r=new ReferralTestRig(); }
    ObjectNode registration(UUID id,String contact) {
        ObjectNode payload=r.json(Map.of("userId",id.toString(),"registeredAt",r.clock.instant().toString(),
            "contactHash",contact,"fingerprintConsent",false,"termsVersion","TEST_ONLY_TERMS")).deepCopy();
        return payload;
    }
    String contact(UUID id) { return Json.sha256(id.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    InboxService restarted() { return new InboxService(r.db,new SourceEventRouter(r.program,r.binding,r.lifecycle,r.recipients,r.evidence),r.settings,r.clock); }
    void due(UUID id) {
        var row=r.db.one("SELECT next_attempt_at FROM referral_schema.inbox WHERE event_id=?",id);
        r.clock.set(instant(row,"next_attempt_at").plusSeconds(1));
    }
    @Test void lostReceiptAndRestartDoNotDuplicateSignupOrChangeItsParent() {
        var parent=r.member(null); UUID id=UUID.randomUUID(),event=UUID.randomUUID();
        var payload=registration(id,contact(id));payload.put("parentCode",parent.code());
        var envelope=r.envelope("account.registered",id,payload,event);
        r.inbox.receive("auth",envelope); r.inbox.receive("auth",envelope);
        assertTrue(restarted().applyOne()); assertFalse(restarted().applyOne());
        assertEquals(2,r.db.count("SELECT count(*) FROM referral_schema.member"));
        assertEquals(parent.id(),uuid(r.db.one("SELECT parent_id FROM referral_schema.member WHERE user_id=?",id),"parent_id"));
        ObjectNode changed=envelope.deepCopy();((ObjectNode)changed.get("payload")).putNull("parentCode");
        assertEquals("SOURCE_EVENT_ID_CONFLICT",assertThrows(ReferralProblem.class,()->r.inbox.receive("auth",changed)).getMessage());
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.reward"));
    }
    @Test void failedHandlerRollsBackItsPartialSignupBeforeRetry() {
        UUID id=UUID.randomUUID(), event=UUID.randomUUID();var payload=registration(id,contact(id));
        var envelope=r.envelope("account.registered",id,payload,event);r.inbox.receive("auth",envelope);
        SourceEventRouter broken=mock(SourceEventRouter.class);
        doAnswer(invocation->{r.program.register(payload);throw new ReferralProblem(503,"TEST_INJECTED_AFTER_INSERT");})
            .when(broken).apply(anyString(),anyString(),any(UUID.class),any(JsonNode.class));
        assertTrue(new InboxService(r.db,broken,r.settings,r.clock).applyOne());
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=?",id));
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.wallet WHERE user_id=?",id));
        assertEquals("RECEIVED",r.db.one("SELECT status FROM referral_schema.inbox WHERE event_id=?",event).get("status"));
        due(event);assertTrue(restarted().applyOne());assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=?",id));
    }
    @Test void boundedFailureBecomesDeadAndEvidenceReplayKeepsOriginalIdentity() {
        UUID user=UUID.randomUUID(), event=UUID.randomUUID();
        var payload=r.json(Map.of("userId",user.toString(),"version",2,"active",false,"reasonRef","TEST_ONLY_STATUS"));
        r.inbox.receive("auth",r.envelope("account.status",user,payload,event));
        for(int n=0;n<12;n++) { due(event);assertTrue(restarted().applyOne()); }
        assertEquals("DEAD",r.db.one("SELECT status FROM referral_schema.inbox WHERE event_id=?",event).get("status"));
        assertEquals(12,r.db.count("SELECT attempts FROM referral_schema.inbox WHERE event_id=?",event));
        assertFalse(restarted().applyOne());
        r.program.register(registration(user,contact(user)));
        assertThrows(ReferralProblem.class,()->r.inbox.replay(r.approver,"auth",event,""));
        r.inbox.replay(r.approver,"auth",event,"TEST_ONLY_DEPENDENCY_REPAIRED");assertTrue(restarted().applyOne());
        assertFalse(bool(r.db.one("SELECT is_active FROM referral_schema.member WHERE user_id=?",user),"is_active"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.inbox WHERE event_id=?",event));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.audit WHERE action='IMMUTABLE_INBOX_REPLAY'"));
    }
    @Test void permanentInvalidPayloadIsQuarantinedWithoutPartialEnrollment() {
        UUID user=UUID.randomUUID(),event=UUID.randomUUID();var payload=registration(user,"bad");
        r.inbox.receive("auth",r.envelope("account.registered",user,payload,event));assertTrue(r.inbox.applyOne());
        assertEquals("DEAD",r.db.one("SELECT status FROM referral_schema.inbox WHERE event_id=?",event).get("status"));
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.member"));
    }
    @Test void simultaneousEquivalentRegistrationCallsHaveOneDurableIdentity() throws Exception {
        UUID user=UUID.randomUUID();var payload=registration(user,contact(user));
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Callable<Boolean>> work=new ArrayList<>();
            for(int n=0;n<16;n++) work.add(()->{r.program.register(payload);return true;});
            for(var future:pool.invokeAll(work)) assertTrue(future.get(20,TimeUnit.SECONDS));
        }
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.member"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.wallet"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.audit WHERE action='ATTRIBUTION_LOCKED'"));
    }
    @Test void simultaneousSharedIdentitySignalsCannotBothEscapeReview() throws Exception {
        String signal=contact(UUID.randomUUID());
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Callable<Boolean>> work=new ArrayList<>();
            for(int n=0;n<12;n++) {var payload=registration(UUID.randomUUID(),signal);work.add(()->{r.program.register(payload);return true;});}
            for(var future:pool.invokeAll(work)) assertTrue(future.get(20,TimeUnit.SECONDS));
        }
        assertEquals(12,r.db.count("SELECT count(*) FROM referral_schema.member"));
        assertEquals(11,r.db.count("SELECT count(*) FROM referral_schema.fraud_case WHERE reason_code='DUPLICATE_IDENTITY_SIGNAL' AND status='OPEN'"));
    }
    @Test void referralCodeCollisionRetriesWithoutLosingTransaction() {
        var parent=r.member(null);String next=ReferralCodes.generate();UUID user=UUID.randomUUID();
        try(var codes=mockStatic(ReferralCodes.class,CALLS_REAL_METHODS)) {
            codes.when(ReferralCodes::generate).thenReturn(parent.code(),next);
            r.program.register(registration(user,contact(user)));
        }
        assertEquals(next,r.db.one("SELECT code FROM referral_schema.member WHERE user_id=?",user).get("code"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.wallet WHERE user_id=?",user));
    }
    @Test void competingAwardWorkersApplyOneFinancialEffect() throws Exception {
        var parent=r.member(null);var seller=r.member(parent);var buyer=r.member(null);var order=r.order(seller,buyer,100000);
        r.deliver(order);r.finance(order,1,0,7000);long applied=0;
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Callable<Boolean>> work=new ArrayList<>();for(int n=0;n<24;n++) work.add(()->r.awards.award(order.id()));
            for(var future:pool.invokeAll(work)) if(future.get(20,TimeUnit.SECONDS)) applied++;
        }
        assertEquals(1,applied);assertEquals(2000,r.balance(parent,"pending_paise"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE order_id=?",order.id()));
    }
    @Test void expiredClaimAndOldLeaseCannotBeReusedAsExecutionAuthority() {
        r.db.tx(()->{r.db.emit("TEST_EVENT","referral.reward.credited",Map.of("synthetic",true));return null;});
        var request=r.json(Map.of("claimId",UUID.randomUUID().toString(),"limit",1));var first=r.outbox.claim("finance",request);
        assertEquals(first,r.outbox.claim("finance",request));var item=first.get("items").get(0);
        r.clock.set(java.time.Instant.parse(item.get("leaseUntil").asText()));
        assertEquals("OUTBOX_CLAIM_NO_LONGER_VALID",assertThrows(ReferralProblem.class,()->r.outbox.claim("finance",request)).getMessage());
        var next=r.outbox.claim("finance",r.json(Map.of("claimId",UUID.randomUUID().toString(),"limit",1))).get("items").get(0);
        assertEquals(item.get("id"),next.get("id"));assertNotEquals(item.get("leaseId"),next.get("leaseId"));
        assertThrows(ReferralProblem.class,()->r.outbox.acknowledge("finance",r.json(Map.of("eventId",item.get("id").asText(),"leaseId",item.get("leaseId").asText()))));
        var ack=r.json(Map.of("eventId",next.get("id").asText(),"leaseId",next.get("leaseId").asText()));
        r.outbox.acknowledge("finance",ack);r.outbox.acknowledge("finance",ack);
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.outbox WHERE status='ACKED'"));
    }
    @Test void outboxExhaustionRequiresAuditedReplayNotAReplacementEvent() {
        r.db.tx(()->{r.db.emit("TEST_EVENT","referral.reward.credited",Map.of("synthetic",true));return null;});
        UUID event=null;
        for(int n=0;n<12;n++) {
            var item=r.outbox.claim("finance",r.json(Map.of("claimId",UUID.randomUUID().toString(),"limit",1))).get("items").get(0);
            event=UUID.fromString(item.get("id").asText());r.clock.advance(Duration.ofSeconds(121));
        }
        assertEquals(0,r.outbox.claim("finance",r.json(Map.of("claimId",UUID.randomUUID().toString(),"limit",1))).get("items").size());
        assertEquals("DEAD",r.db.one("SELECT status FROM referral_schema.outbox WHERE id=?",event).get("status"));
        r.outbox.replay(r.approver,event,"TEST_ONLY_CONSUMER_REPAIRED");
        var next=r.outbox.claim("finance",r.json(Map.of("claimId",UUID.randomUUID().toString(),"limit",1))).get("items").get(0);
        assertEquals(event.toString(),next.get("id").asText());assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.outbox"));
    }
}
