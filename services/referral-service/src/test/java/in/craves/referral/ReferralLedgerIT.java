package in.craves.referral;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.referral.ReferralTestRig.Member;
import in.craves.referral.ReferralTestRig.Order;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import static in.craves.referral.infra.Store.*;
import static org.junit.jupiter.api.Assertions.*;

class ReferralLedgerIT {
    ReferralTestRig r;
    Member a,b,c,d,e,buyer;
    @BeforeEach void setup() {
        r=new ReferralTestRig(); a=r.member(null); b=r.member(a); c=r.member(b); d=r.member(c); e=r.member(d); buyer=r.member(null);
    }
    private Order award(Member seller,long amount) {
        Order order=r.order(seller,buyer,amount); r.deliver(order); r.finance(order,1,0,amount); assertTrue(r.awards.award(order.id())); return order;
    }
    @Test void canonicalThreeGenerationsAndFourPercentCeiling() {
        Order byB=award(b,100000), byC=award(c,100000), byD=award(d,100000), byE=award(e,100000);
        assertEquals(4000,r.balance(a,"pending_paise"));
        assertEquals(2000,r.db.count("SELECT sum(amount_paise) FROM referral_schema.reward WHERE order_id=?",byB.id()));
        assertEquals(3200,r.db.count("SELECT sum(amount_paise) FROM referral_schema.reward WHERE order_id=?",byC.id()));
        assertEquals(4000,r.db.count("SELECT sum(amount_paise) FROM referral_schema.reward WHERE order_id=?",byD.id()));
        assertEquals(4000,r.db.count("SELECT sum(amount_paise) FROM referral_schema.reward WHERE order_id=?",byE.id()));
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE order_id=? AND beneficiary_id=?",byE.id(),a.id()));
        assertFalse(r.awards.award(byD.id()));
        assertEquals(3,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE order_id=?",byD.id()));
    }
    @Test void immutableSignupAndNoRecruitmentPayment() {
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.journal"));
        r.db.tx(()->{ r.program.register(a.registration()); return null; });
        assertEquals(6,r.db.count("SELECT count(*) FROM referral_schema.member"));
        assertThrows(DataAccessException.class,()->r.db.update("UPDATE referral_schema.member SET parent_id=? WHERE user_id=?",e.id(),a.id()));
        ObjectNode changed=a.registration().deepCopy(); changed.put("parentCode",e.code());
        assertThrows(ReferralProblem.class,()->r.db.tx(()->{ r.program.register(changed); return null; }));
        ObjectNode duplicateContact=b.registration().deepCopy(); duplicateContact.put("userId",UUID.randomUUID().toString());
        duplicateContact.put("contactHash",a.registration().get("contactHash").asText());
        assertThrows(ReferralProblem.class,()->r.db.tx(()->{ r.program.register(duplicateContact); return null; }));
    }
    @Test void customerBonusUsesIndependentPrefundedBudgetAndOnlyOneCheckout() {
        Member referredBuyer=r.member(a); Order order=r.order(d,referredBuyer,100000);
        r.deliver(order); r.finance(order,1,0,10000); r.first(order); r.awards.award(order.id());
        assertThrows(ReferralProblem.class,()->r.awards.awardCustomer(order.checkout()));
        r.fund("CUSTOMER",40000); assertTrue(r.awards.awardCustomer(order.checkout()));
        assertFalse(r.awards.awardCustomer(order.checkout()));
        assertEquals(40800,r.balance(a,"pending_paise"));
        assertEquals(4000,r.db.count("SELECT sum(amount_paise) FROM referral_schema.reward WHERE checkout_id=? AND track='UPLINE'",order.checkout()));
        assertEquals(40000,r.db.count("SELECT sum(amount_paise) FROM referral_schema.reward WHERE checkout_id=? AND track='CUSTOMER'",order.checkout()));
        assertEquals(0,r.db.count("SELECT available_paise FROM referral_schema.budget WHERE track='CUSTOMER'"));
        Order next=r.order(d,referredBuyer,100000); r.deliver(next); r.finance(next,1,0,10000);
        assertThrows(ReferralProblem.class,()->r.first(next)); assertFalse(r.awards.awardCustomer(next.checkout()));
        r.refund(order,1,50000,false);
        assertEquals(40000,r.db.count("SELECT r.amount_paise-COALESCE((SELECT sum(v.amount_paise) FROM referral_schema.reversal v WHERE v.reward_id=r.id),0) FROM referral_schema.reward r WHERE r.checkout_id=? AND r.track='CUSTOMER'",order.checkout()));
        r.refund(order,2,100000,true);
        assertEquals(0,r.balance(a,"pending_paise")); assertEquals(40000,r.db.count("SELECT available_paise FROM referral_schema.budget WHERE track='CUSTOMER'"));
    }
    @Test void orderFloorAndCommissionFundingFailClosed() {
        Order tiny=r.order(d,buyer,79999); r.deliver(tiny); r.finance(tiny,1,0,0);
        assertTrue(r.awards.award(tiny.id())); assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.reward"));
        Order qualifying=r.order(d,buyer,100000); r.deliver(qualifying); r.finance(qualifying,1,0,3999);
        assertFalse(r.awards.award(qualifying.id())); assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.reward"));
        r.finance(qualifying,2,0,4000); assertTrue(r.awards.award(qualifying.id()));
        assertEquals(4000,r.db.count("SELECT sum(amount_paise) FROM referral_schema.reward"));
    }
    @Test void partialRefundRemainsSettleableAndFullRefundIsIdempotent() {
        Order order=award(d,100000);
        UUID direct=uuid(r.db.one("SELECT id FROM referral_schema.reward WHERE order_id=? AND level=1",order.id()),"id");
        assertFalse(r.settlement.settle(direct));
        r.refund(order,1,25000,false);
        assertEquals(1500,r.balance(c,"pending_paise"));
        assertEquals(3,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE status='PENDING'"));
        r.mature(order,25000);
        assertEquals(1500,r.balance(c,"available_paise")); assertEquals(0,r.balance(c,"pending_paise"));
        r.refund(order,2,100000,true);
        assertEquals(0,r.balance(c,"available_paise"));
        long count=r.db.count("SELECT count(*) FROM referral_schema.reversal");
        r.refund(order,2,100000,true); assertEquals(count,r.db.count("SELECT count(*) FROM referral_schema.reversal"));
        assertThrows(ReferralProblem.class,()->r.refund(order,3,50000,false));
    }
    @Test void cumulativeRefundBeforeAwardAndMultipleReversals() {
        Order order=r.order(d,buyer,100000); r.deliver(order); r.refund(order,1,33333,false);
        r.finance(order,1,33333,10000); assertTrue(r.awards.award(order.id()));
        assertEquals(1333,r.balance(c,"pending_paise"));
        r.refund(order,2,66667,false); assertEquals(666,r.balance(c,"pending_paise"));
        r.refund(order,3,100000,true); assertEquals(0,r.balance(c,"pending_paise"));
        assertEquals(9,r.db.count("SELECT count(*) FROM referral_schema.reversal"));
    }
    @Test void policyRevisionAffectsOnlyNewSnapshots() {
        Order old=r.order(d,buyer,100000);
        long next=r.program.createPolicy(r.maker,r.policyBody(Long.toString(r.policy),100,120,80));
        assertThrows(ReferralProblem.class,()->r.program.approvePolicy(r.maker,next,r.clock.instant().plusSeconds(1),r.policy));
        r.program.approvePolicy(r.approver,next,r.clock.instant().plusSeconds(1),r.policy); r.clock.advance(Duration.ofSeconds(2));
        Order fresh=r.order(d,buyer,100000);
        for(Order order:List.of(old,fresh)) { r.deliver(order); r.finance(order,1,0,10000); r.awards.award(order.id()); }
        assertEquals(2000,r.db.count("SELECT amount_paise FROM referral_schema.reward WHERE order_id=? AND level=1",old.id()));
        assertEquals(1000,r.db.count("SELECT amount_paise FROM referral_schema.reward WHERE order_id=? AND level=1",fresh.id()));
        assertThrows(DataAccessException.class,()->r.db.update("UPDATE referral_schema.order_snapshot SET food_paise=1 WHERE order_id=?",old.id()));
    }
    @Test void deliveryAloneAndStaleReconciliationCannotCreditWallet() {
        Order order=r.order(d,buyer,100000); r.deliver(order); assertFalse(r.awards.award(order.id()));
        r.finance(order,1,0,10000); r.awards.award(order.id());
        UUID id=uuid(r.db.one("SELECT id FROM referral_schema.reward WHERE order_id=? AND level=1",order.id()),"id");
        r.clock.advance(Duration.ofDays(15)); assertFalse(r.settlement.settle(id));
        assertEquals(0,r.balance(c,"available_paise"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.outbox WHERE event_type='referral.finance.refresh.requested'"));
        r.finance(order,2,0,10000); assertTrue(r.settlement.settle(id)); assertFalse(r.settlement.settle(id));
        assertEquals(2000,r.balance(c,"available_paise"));
    }
    @Test void databaseRejectsStatusChangesWithoutMatchingJournalAndWrongOwner() {
        Order order=award(d,100000); Map<String,Object> reward=r.db.one("SELECT * FROM referral_schema.reward WHERE order_id=? AND level=1",order.id());
        UUID id=uuid(reward,"id");
        assertThrows(DataAccessException.class,()->r.db.update("UPDATE referral_schema.reward SET status='CREDITED' WHERE id=?",id));
        assertThrows(DataAccessException.class,()->r.db.tx(()->{ r.db.journal("forged-owner",a.id(),-2000,2000,0,"INTERNAL_TRANSFER",id,order.checkout()); return null; }));
        assertThrows(DataAccessException.class,()->r.db.update("UPDATE referral_schema.reward SET amount_paise=99999 WHERE id=?",id));
        assertEquals(2000,r.balance(c,"pending_paise")); assertEquals(0,r.balance(c,"available_paise"));
    }
}
