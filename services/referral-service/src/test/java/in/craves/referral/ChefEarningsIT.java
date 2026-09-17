package in.craves.referral;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.referral.core.ChefReferralPolicy;
import in.craves.referral.domain.ChefEarningsService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static in.craves.referral.infra.Store.*;
import static org.junit.jupiter.api.Assertions.*;

class ChefEarningsIT {
    ReferralTestRig t; ChefEarningsService service;
    @BeforeEach void setup() {
        t=new ReferralTestRig(); service=new ChefEarningsService(t.db,t.program,t.locks,t.clock);
        ObjectNode policy=(ObjectNode)t.policyBody("2",200,120,80);
        policy.put("programKind",ChefReferralPolicy.VERSION).put("holdDays",1).put("minimumPaise","25000")
            .put("customerBonusPaise","0").put("inviteeDiscountPaise","0");
        long id=t.program.createPolicy(t.maker,policy);
        t.program.approvePolicy(t.approver,id,t.clock.instant().plusSeconds(1),t.policy);
        t.clock.advance(Duration.ofSeconds(2));
    }
    void eligible(ReferralTestRig.Member member,int version,boolean eligible) {
        t.program.chefStatus(t.json(Map.of("userId",member.id().toString(),"version",version,"eligible",eligible,"observedAt",t.clock.instant().toString())));
    }
    ReferralTestRig.Order order(ReferralTestRig.Member seller,long food) {
        var order=t.order(seller,t.member(null),food); t.deliver(order); t.finance(order,1,0,food);
        // Synthetic capture receipt represents Finance's immutable paidAt, not a live payment.
        t.db.update("UPDATE referral_schema.order_state SET verified_paid_at=? WHERE order_id=?",time(t.clock.instant()),order.id());
        return order;
    }
    void due(ReferralTestRig.Order order,List<ReferralTestRig.Member> members) {
        Instant paid=instant(t.db.one("SELECT verified_paid_at FROM referral_schema.order_state WHERE order_id=?",order.id()),"verified_paid_at");
        t.clock.set(ChefReferralPolicy.firstPostingRun(paid,paid));
        t.finance(order,2,0,order.food()); for(var member:members) eligible(member,2,true);
    }
    long credited(UUID owner) {return t.db.count("SELECT coalesce(sum(amount_paise),0) FROM referral_schema.chef_posting WHERE beneficiary_id=?",owner);}
    @Test void creditsThreeChefLevelsAtNineAmWithoutTouchingWalletOrSeller() {
        var a=t.member(null);var b=t.member(a);var c=t.member(b);var seller=t.member(c);
        var members=List.of(a,b,c,seller); members.forEach(m->eligible(m,1,true)); var order=order(seller,30000);
        assertFalse(t.awards.award(order.id())); assertTrue(service.process(order.id()));
        assertEquals(0,credited(c.id())); due(order,members); assertTrue(service.process(order.id()));
        assertEquals(600,credited(c.id()));assertEquals(360,credited(b.id()));assertEquals(240,credited(a.id()));
        assertEquals(0,credited(seller.id())); assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.journal"));
        assertEquals(3,t.db.count("SELECT count(*) FROM referral_schema.outbox WHERE event_type='referral.chef.earning'"));
        assertFalse(service.process(order.id()));
    }
    @Test void thresholdIsStrictAndCustomerAncestorDoesNotReceiveOrRedistribute() {
        var a=t.member(null);var b=t.member(a);var seller=t.member(b);
        eligible(a,1,true);eligible(b,1,false);eligible(seller,1,true);
        assertFalse(service.process(order(seller,25000).id()));
        var order=order(seller,30000);assertTrue(service.process(order.id()));
        assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.chef_reward"));
        assertEquals(360,t.db.count("SELECT amount_paise FROM referral_schema.chef_reward"));
    }
    @Test void missingStaleOrRevokedAuthorityCannotCreateOrCreditMoney() {
        var a=t.member(null);var seller=t.member(a);var order=order(seller,30000);
        assertFalse(service.process(order.id()));eligible(a,1,true);eligible(seller,1,true);
        assertTrue(service.process(order.id())); t.clock.advance(Duration.ofDays(2));t.finance(order,2,0,30000);
        assertFalse(service.process(order.id()));eligible(a,2,true);eligible(seller,2,false);
        assertFalse(service.process(order.id()));assertEquals(0,credited(a.id()));
    }
    @Test void captureAndDeliveryHoldRequiresLaterTimestampAndFreshFinance() {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);var order=order(seller,30000);
        t.db.update("UPDATE referral_schema.order_state SET verified_paid_at=NULL WHERE order_id=?",order.id());
        assertFalse(service.process(order.id()));assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.chef_reward"));
        t.clock.advance(Duration.ofHours(4));t.db.update("UPDATE referral_schema.order_state SET verified_paid_at=? WHERE order_id=?",time(t.clock.instant()),order.id());
        eligible(a,2,true);eligible(seller,2,true);t.finance(order,2,0,30000);assertTrue(service.process(order.id()));
        assertEquals(ChefReferralPolicy.firstPostingRun(t.clock.instant(),t.clock.instant().minusSeconds(14400)),
            instant(t.db.one("SELECT eligible_at FROM referral_schema.chef_reward"),"eligible_at"));
    }
    @Test void concurrentOrdersCannotExceedMonthlyCapAndOverflowCannotAutoCarry() throws Exception {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);
        var one=order(seller,5000000);var two=order(seller,5000000); // INR1,000 each at level1.
        service.process(one.id());service.process(two.id());due(one,List.of(a,seller));t.finance(two,2,0,two.food());
        try(var pool=Executors.newFixedThreadPool(2)) {
            var results=pool.invokeAll(List.of(()->service.process(one.id()),()->service.process(two.id())));
            for(var result:results) result.get();
        }
        assertEquals(150000,credited(a.id()));assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.chef_reward_review"));
        assertEquals(150000,t.db.count("SELECT posted_paise-reversed_paise FROM referral_schema.chef_month"));
        assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.chef_posting WHERE amount_paise=50000"));
        t.clock.set(Instant.parse("2026-10-01T04:00:00Z"));eligible(a,3,true);eligible(seller,3,true);
        t.finance(one,3,0,one.food());t.finance(two,3,0,two.food());service.process(one.id());service.process(two.id());
        assertEquals(150000,credited(a.id()));
    }
    @Test void refundReversesOnceAndRestoresOriginalMonthEvenAfterRoleRevocation() {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);var order=order(seller,30000);
        service.process(order.id());due(order,List.of(a,seller));service.process(order.id());assertEquals(600,credited(a.id()));
        t.clock.set(Instant.parse("2026-10-01T04:00:00Z"));eligible(a,3,false);
        t.refund(order,1,15000,false);assertTrue(service.process(order.id()));assertEquals(300,credited(a.id()));
        assertFalse(service.process(order.id()));
        assertEquals("2026-09-01",t.db.one("SELECT month FROM referral_schema.chef_month").get("month").toString());
        assertEquals(300,t.db.count("SELECT reversed_paise FROM referral_schema.chef_month"));
        t.refund(order,2,30000,true);assertTrue(service.process(order.id()));assertEquals(0,credited(a.id()));
        assertEquals(600,t.db.count("SELECT reversed_paise FROM referral_schema.chef_month"));
    }
    @Test void exhaustedCapCreatesNoVisibleRewardAndSkippedRewardNeverReturns() {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);
        var full=order(seller,7500000);var skipped=order(seller,30000);
        service.process(full.id());service.process(skipped.id());due(full,List.of(a,seller));t.finance(skipped,2,0,skipped.food());
        assertTrue(service.process(full.id()));assertTrue(service.process(skipped.id()));
        assertEquals(150000,credited(a.id()));assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.chef_posting"));
        assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.chef_cap_decision WHERE credited_paise=0"));
        assertFalse(service.process(skipped.id()));
        var queries=new in.craves.referral.api.MemberQueries(t.db,t.program,t.recipients,t.settings,t.clock);
        var view=queries.chefEarnings(a.id());
        assertEquals(true,view.get("monthlyCapReached"));assertEquals("0",view.get("monthRemainingPaise"));
        assertFalse(view.containsKey("monthlyCapReviewCount"));
        assertEquals(1,((List<?>)view.get("recentPostings")).size());
        // A refund restores this month's allowance for NEW rewards, not skipped ones.
        t.refund(full,1,7500000,true);assertTrue(service.process(full.id()));
        assertEquals(0,credited(a.id()));assertFalse(service.process(skipped.id()));
        assertEquals("150000",queries.chefEarnings(a.id()).get("monthRemainingPaise"));
        t.clock.set(Instant.parse("2026-09-30T18:30:00Z")); // October starts in India.
        eligible(a,3,true);eligible(seller,3,true);t.finance(skipped,3,0,skipped.food());
        assertFalse(service.process(skipped.id()));assertEquals(0,credited(a.id()));
        assertEquals("2026-10",queries.chefEarnings(a.id()).get("postingMonth"));
        var next=order(seller,30000);due(next,List.of(a,seller));
        eligible(a,4,true);eligible(seller,4,true);assertTrue(service.process(next.id()));
        assertEquals(600,credited(a.id()));
        assertThrows(Exception.class,()->t.db.update("DELETE FROM referral_schema.chef_cap_decision"));
    }
    @Test void oldPolicyReviewUsesOnlyRemainingAllowanceAndPartialCreditRefundDoesNotRestoreExcess() {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);
        var first=order(seller,7499950);var last=order(seller,30000); // one paise remains.
        service.process(first.id());service.process(last.id());due(first,List.of(a,seller));t.finance(last,2,0,last.food());
        service.process(first.id());
        UUID reward=uuid(t.db.one("SELECT id FROM referral_schema.chef_reward WHERE order_id=?",last.id()),"id");
        t.db.update("INSERT INTO referral_schema.chef_reward_review VALUES (?,'MONTHLY_CAP_POLICY_REQUIRED',?)",reward,time(t.clock.instant()));
        assertTrue(service.process(last.id()));assertEquals(150000,credited(a.id()));
        assertEquals(1,t.db.count("SELECT amount_paise FROM referral_schema.chef_posting WHERE reward_id=?",reward));
        t.refund(last,1,30000,true);assertTrue(service.process(last.id()));
        assertEquals(149999,credited(a.id()));assertFalse(service.process(last.id()));
        assertEquals(1,t.db.count("SELECT reversed_paise FROM referral_schema.chef_month"));
    }
    @Test void insufficientCommissionDoesNotDebitSellingChefOrCreateReward() {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);var order=order(seller,30000);
        t.finance(order,2,0,599);assertFalse(service.process(order.id()));assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.chef_reward"));
    }
    @Test void duplicateWorkersIssueOnePostingAndSourceHistoryCannotBeChanged() throws Exception {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);var order=order(seller,30000);
        due(order,List.of(a,seller));
        try(var pool=Executors.newFixedThreadPool(4)) {
            var results=pool.invokeAll(List.of(()->service.process(order.id()),()->service.process(order.id()),()->service.process(order.id()),()->service.process(order.id())));
            for(var result:results) result.get();
        }
        assertEquals(600,credited(a.id()));assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.chef_posting"));
        assertThrows(Exception.class,()->t.db.update("UPDATE referral_schema.chef_posting SET amount_paise=1"));
        assertThrows(Exception.class,()->t.db.update("DELETE FROM referral_schema.chef_reward"));
    }
    @Test void eligibilityRejectsSameVersionChangedContentAndIgnoresOldVersion() {
        var a=t.member(null);eligible(a,2,true);
        assertThrows(ReferralProblem.class,()->eligible(a,2,false));eligible(a,1,false);
        assertTrue(bool(t.db.one("SELECT eligible FROM referral_schema.chef_membership WHERE user_id=?",a.id()),"eligible"));
    }
    @Test void ordinaryCustomerDoesNotNeedReferralConsentOrMembershipToBuyFromReferredChef() {
        var seller=t.member(t.member(null));var template=t.order(seller,t.member(null),30000);
        UUID buyer=UUID.randomUUID(),order=UUID.randomUUID(),checkout=UUID.randomUUID();
        var body=((ObjectNode)template.binding()).deepCopy().put("buyerUserId",buyer.toString()).put("chefOrderId",order.toString()).put("checkoutId",checkout.toString());
        t.db.tx(()->{t.binding.bind(body);return null;});
        assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.order_snapshot WHERE order_id=?",order));
        assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.member WHERE user_id=?",buyer));
    }
    @Test void queuedChefRevocationBlocksCreditBeforeTheAccountWorkerCatchesUp() {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);var order=order(seller,30000);
        service.process(order.id());due(order,List.of(a,seller));
        var payload=t.json(Map.of("userId",a.id().toString(),"version",3,"eligible",false,"observedAt",t.clock.instant().toString()));
        t.inbox.receive("auth",t.envelope("account.chef_status",a.id(),payload,UUID.randomUUID()));
        assertFalse(service.process(order.id()));assertEquals(0,credited(a.id()));
        assertTrue(t.inbox.applyOne());assertFalse(service.process(order.id()));assertEquals(0,credited(a.id()));
    }
    @Test void pausingNewEarningsStillReconcilesRefundsOfPreviousCredits() {
        var a=t.member(null);var seller=t.member(a);eligible(a,1,true);eligible(seller,1,true);var order=order(seller,30000);
        due(order,List.of(a,seller));assertFalse(service.process(order.id(),false));
        assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.chef_reward"));
        assertTrue(service.process(order.id(),true));assertEquals(600,credited(a.id()));
        t.refund(order,1,30000,true);assertTrue(service.process(order.id(),false));assertEquals(0,credited(a.id()));
        assertFalse(service.process(order.id(),false));
    }
}
