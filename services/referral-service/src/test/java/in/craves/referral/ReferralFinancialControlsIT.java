package in.craves.referral;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralTestRig.Member;
import in.craves.referral.ReferralTestRig.Order;
import in.craves.referral.domain.PayoutBatchPlanner;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

class ReferralFinancialControlsIT {
    ReferralTestRig r;
    Member owner,seller,buyer;
    Order earningOrder;
    @BeforeEach void setup() {
        r=new ReferralTestRig(); owner=r.member(null); seller=r.member(owner); buyer=r.member(null);
        earningOrder=r.order(seller,buyer,100000); r.deliver(earningOrder); r.finance(earningOrder,1,0,7000); r.awards.award(earningOrder.id());
        r.mature(earningOrder,0); r.assess(owner); assertEquals(2000,r.balance(owner,"available_paise"));
    }
    private JsonNode operation(String type,JsonNode payload,UUID id) {
        return r.json(Map.of("operationId",id.toString(),"operationType",type,"payload",payload));
    }
    private JsonNode payout(UUID id,UUID attempt,String outcome,UUID event) {
        Map<String,Object> body=new LinkedHashMap<>();
        body.put("outcomeId",event.toString()); body.put("reservationId",id.toString()); body.put("attemptId",attempt.toString());
        body.put("outcome",outcome); body.put("netPaise","1400"); body.put("withholdingPaise","100"); body.put("evidenceRef","TEST_ONLY_RECONCILIATION");
        if(outcome.equals("PAID")) { body.put("providerRef","TEST_ONLY_UTR:"+attempt); body.put("paidAt",r.clock.instant().toString()); }
        return r.json(body);
    }
    private UUID reviewedCashout() {
        UUID id=UUID.randomUUID(); r.cashouts.request(owner.id(),id,1500);
        assertThrows(ReferralProblem.class,()->r.cashouts.approve(owner.id(),id,1400,100,"TEST_ONLY_SELF_APPROVAL"));
        r.cashouts.approve(r.approver,id,1400,100,"TEST_ONLY_FINANCE_REVIEW");
        r.clock.set(PayoutBatchPlanner.weeklyCutoff(r.clock.instant()).plus(Duration.ofDays(7)).plusSeconds(1));
        assertTrue(r.planner.plan(id)); return id;
    }
    @Test void cashoutReservationIdempotencyAndConcurrentBalanceProtection() throws Exception {
        UUID id=UUID.randomUUID(); r.cashouts.request(owner.id(),id,1500); r.cashouts.request(owner.id(),id,1500);
        assertEquals(500,r.balance(owner,"available_paise")); assertEquals(1500,r.balance(owner,"reserved_paise"));
        assertThrows(ReferralProblem.class,()->r.cashouts.request(owner.id(),id,1600));
        r.cashouts.cancel(owner.id(),id); assertEquals(2000,r.balance(owner,"available_paise"));
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Callable<Boolean>> work=new ArrayList<>();
            for(int i=0;i<16;i++) work.add(()->{
                try { r.cashouts.request(owner.id(),UUID.randomUUID(),1500); return true; }
                catch(ReferralProblem ex) { assertEquals("INSUFFICIENT_AVAILABLE_BALANCE",ex.getMessage()); return false; }
            });
            long accepted=0; for(var future:pool.invokeAll(work)) if(future.get(20,TimeUnit.SECONDS)) accepted++;
            assertEquals(1,accepted);
        }
        assertEquals(500,r.balance(owner,"available_paise")); assertEquals(1500,r.balance(owner,"reserved_paise"));
    }
    @Test void uncertainPaymentStaysReservedAndOnlyOriginalAttemptCanResolve() {
        UUID id=reviewedCashout(); UUID attempt=uuid(r.db.one("SELECT attempt_id FROM referral_schema.reservation WHERE id=?",id),"attempt_id");
        r.db.tx(()->{ r.evidence.record(payout(id,attempt,"UNKNOWN",UUID.randomUUID())); return null; });
        assertEquals("UNKNOWN",r.db.one("SELECT status FROM referral_schema.reservation WHERE id=?",id).get("status"));
        assertEquals(1500,r.balance(owner,"reserved_paise")); assertFalse(r.planner.plan(id));
        assertThrows(ReferralProblem.class,()->r.cashouts.cancel(owner.id(),id));
        assertThrows(ReferralProblem.class,()->r.db.tx(()->{ r.evidence.record(payout(id,UUID.randomUUID(),"PAID",UUID.randomUUID())); return null; }));
        JsonNode paid=payout(id,attempt,"PAID",UUID.randomUUID());
        r.db.tx(()->{ r.evidence.record(paid); return null; });
        r.db.tx(()->{ r.evidence.record(paid); return null; });
        assertEquals(0,r.balance(owner,"reserved_paise")); assertEquals(500,r.balance(owner,"available_paise"));
        assertEquals(1400,r.db.count("SELECT counterparty_delta FROM referral_schema.journal WHERE event_key=?","payout-net:"+id));
        assertEquals(100,r.db.count("SELECT counterparty_delta FROM referral_schema.journal WHERE event_key=?","payout-tax:"+id));
        assertThrows(ReferralProblem.class,()->r.db.tx(()->{ r.evidence.record(payout(id,attempt,"PROVEN_FAILED",UUID.randomUUID())); return null; }));
    }
    @Test void provenOriginalAttemptFailureRestoresReservationExactlyOnce() {
        UUID id=reviewedCashout(); UUID attempt=uuid(r.db.one("SELECT attempt_id FROM referral_schema.reservation WHERE id=?",id),"attempt_id");
        JsonNode failed=payout(id,attempt,"PROVEN_FAILED",UUID.randomUUID());
        r.db.tx(()->{ r.evidence.record(failed); return null; }); r.db.tx(()->{ r.evidence.record(failed); return null; });
        assertEquals(2000,r.balance(owner,"available_paise")); assertEquals(0,r.balance(owner,"reserved_paise"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.journal WHERE event_key=?","release:"+id));
    }
    @Test void refundClawbackMayGoNegativeButCannotDispatchReservedMoney() {
        UUID id=UUID.randomUUID(); r.cashouts.request(owner.id(),id,1500);
        r.refund(earningOrder,1,100000,true);
        assertEquals(-1500,r.balance(owner,"available_paise")); assertEquals(1500,r.balance(owner,"reserved_paise"));
        assertThrows(ReferralProblem.class,()->r.cashouts.approve(r.approver,id,1400,100,"TEST_ONLY_REVIEW"));
        r.cashouts.cancel(owner.id(),id); assertEquals(0,r.balance(owner,"available_paise")); assertEquals(0,r.balance(owner,"reserved_paise"));
    }
    @Test void walletSpendConsumeAndCumulativeRestoreAreExactAndSourceRestricted() {
        Member other=r.member(null); Order checkout=r.order(other,owner,100000,98500); UUID id=UUID.randomUUID();
        JsonNode reserve=r.json(Map.of("reservationId",id.toString(),"userId",owner.id().toString(),"checkoutId",checkout.checkout().toString(),"amountPaise","1500","evidenceRef","TEST_ONLY_CHECKOUT"));
        JsonNode envelope=operation("spend.reserve",reserve,UUID.randomUUID());
        r.benefits.apply("order",envelope); r.benefits.apply("order",envelope);
        JsonNode finish=r.json(Map.of("reservationId",id.toString(),"userId",owner.id().toString(),"checkoutId",checkout.checkout().toString(),"evidenceRef","TEST_ONLY_COMMIT"));
        r.benefits.apply("order",operation("spend.consume",finish,UUID.randomUUID()));
        assertEquals(500,r.balance(owner,"available_paise")); assertEquals(0,r.balance(owner,"reserved_paise"));
        JsonNode refund=r.json(Map.of("reservationId",id.toString(),"version",1,"cumulativeRefundPaise","500","evidenceRef","TEST_ONLY_REFUND"));
        assertThrows(ReferralProblem.class,()->r.benefits.apply("order",operation("spend.refund",refund,UUID.randomUUID())));
        r.benefits.apply("finance",operation("spend.refund",refund,UUID.randomUUID()));
        r.benefits.apply("finance",operation("spend.refund",refund,UUID.randomUUID()));
        assertEquals(1000,r.balance(owner,"available_paise"));
        JsonNode full=r.json(Map.of("reservationId",id.toString(),"version",2,"cumulativeRefundPaise","1500","evidenceRef","TEST_ONLY_REFUND"));
        r.benefits.apply("finance",operation("spend.refund",full,UUID.randomUUID())); assertEquals(2000,r.balance(owner,"available_paise"));
        JsonNode excessive=r.json(Map.of("reservationId",id.toString(),"version",3,"cumulativeRefundPaise","1501","evidenceRef","TEST_ONLY_REFUND"));
        assertThrows(ReferralProblem.class,()->r.benefits.apply("finance",operation("spend.refund",excessive,UUID.randomUUID())));
    }
    @Test void inviteeDiscountIsSingleUseAndNeverAnUnfundedPromise() {
        Member invitee=r.member(owner); Order checkout=r.order(seller,invitee,100000,75000); UUID id=UUID.randomUUID();
        JsonNode reserve=r.json(Map.of("reservationId",id.toString(),"buyerUserId",invitee.id().toString(),"checkoutId",checkout.checkout().toString(),
            "foodSubtotalPaise","100000","createdAt",r.clock.instant().toString(),"firstQualifyingOrderEligible",true,"evidenceRef","TEST_ONLY_FIRST_ORDER"));
        assertThrows(ReferralProblem.class,()->r.benefits.apply("order",operation("discount.reserve",reserve,UUID.randomUUID())));
        r.fund("DISCOUNT",25000); UUID operation=UUID.randomUUID();
        r.benefits.apply("order",operation("discount.reserve",reserve,operation)); r.benefits.apply("order",operation("discount.reserve",reserve,operation));
        assertEquals(0,r.db.count("SELECT available_paise FROM referral_schema.budget WHERE track='DISCOUNT'"));
        JsonNode finish=r.json(Map.of("reservationId",id.toString(),"buyerUserId",invitee.id().toString(),"checkoutId",checkout.checkout().toString(),"evidenceRef","TEST_ONLY_COMMIT"));
        r.benefits.apply("order",operation("discount.consume",finish,UUID.randomUUID()));
        JsonNode cancel=r.json(Map.of("reservationId",id.toString(),"buyerUserId",invitee.id().toString(),"checkoutId",checkout.checkout().toString(),"evidenceRef","TEST_ONLY_CANCEL","checkoutCancellationConfirmed",true));
        assertThrows(ReferralProblem.class,()->r.benefits.apply("order",operation("discount.release",cancel,UUID.randomUUID())));
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE checkout_id=?",checkout.checkout()));
    }
}
