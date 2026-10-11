package in.craves.referral;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.referral.api.SourceLookupController;
import in.craves.referral.core.ChefReferralPolicy;
import in.craves.referral.domain.ChefEarningsService;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import static in.craves.referral.infra.Store.*;
import static org.junit.jupiter.api.Assertions.*;

/** Chef commission needs only an enrolled seller: unenrolled buyers bind, unenrolled sellers are excluded. Synthetic data only. */
class ChefActivationIT {
    ReferralTestRig t; ChefEarningsService earnings; SourceLookupController lookup;

    @BeforeEach void setup() {
        t=new ReferralTestRig(); earnings=new ChefEarningsService(t.db,t.program,t.locks,t.clock);
        lookup=new SourceLookupController(t.db,t.settings);
    }
    void activateChefPolicy() {
        ObjectNode policy=(ObjectNode)t.policyBody("2",200,120,80);
        policy.put("programKind",ChefReferralPolicy.VERSION).put("holdDays",1).put("minimumPaise","25000")
            .put("customerBonusPaise","0").put("inviteeDiscountPaise","0");
        long id=t.program.createPolicy(t.maker,policy);
        t.program.approvePolicy(t.approver,id,t.clock.instant().plusSeconds(1),t.policy);
        t.clock.advance(Duration.ofSeconds(2));
    }
    boolean eligible(UUID... users) {
        return (Boolean)lookup.lookup(UUID.randomUUID(),t.clock.instant(),Set.of(users)).get("eligible");
    }
    void chef(ReferralTestRig.Member member,int version) {
        t.program.chefStatus(t.json(Map.of("userId",member.id().toString(),"version",version,"eligible",true,"observedAt",t.clock.instant().toString())));
    }
    ReferralTestRig.Member stranger() { return new ReferralTestRig.Member(UUID.randomUUID(),null,null); }
    long excluded() { return t.db.count("SELECT count(*) FROM referral_schema.order_exclusion"); }

    @Test void legacyLookupNeedsEveryParticipantButChefLookupNeedsOnlyOne() {
        var seller=t.member(null); var buyer=stranger();
        assertFalse(eligible(seller.id(),buyer.id()));
        activateChefPolicy();
        assertTrue(eligible(seller.id(),buyer.id()));
        assertFalse(eligible(stranger().id(),buyer.id()));
    }

    @Test void unenrolledBuyerStillEarnsTheSellersUplineUnderChefPolicy() {
        activateChefPolicy();
        var referrer=t.member(null); var seller=t.member(referrer); chef(referrer,1); chef(seller,1);
        var order=t.order(seller,stranger(),30000); t.deliver(order); t.finance(order,1,0,30000);
        t.db.update("UPDATE referral_schema.order_state SET verified_paid_at=? WHERE order_id=?",time(t.clock.instant()),order.id());
        assertTrue(earnings.process(order.id()));
        t.clock.set(ChefReferralPolicy.firstPostingRun(t.clock.instant(),t.clock.instant()));
        t.finance(order,2,0,30000); chef(referrer,2); chef(seller,2);
        assertTrue(earnings.process(order.id()));
        assertEquals(600,t.db.count("SELECT coalesce(sum(amount_paise),0) FROM referral_schema.chef_posting WHERE beneficiary_id=?",referrer.id()));
        assertEquals(0,excluded());
    }

    @Test void unenrolledSellerIsExcludedOnceAndLaterEventsChangeNothing() {
        activateChefPolicy();
        var buyer=t.member(null); var seller=stranger();
        var order=t.order(seller,buyer,30000);
        assertEquals(1,excluded());
        assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.order_snapshot"));
        assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.checkout"));
        t.db.tx(()->{ t.binding.bind(order.binding()); return null; }); // exact replay is a no-op
        assertEquals(1,excluded());
        ObjectNode changed=(ObjectNode)order.binding().deepCopy(); changed.put("foodSubtotalPaise","29999");
        var conflict=assertThrows(ReferralProblem.class,()->t.db.tx(()->{ t.binding.bind(changed); return null; }));
        assertEquals("ORDER_BINDING_CONFLICT",conflict.getMessage());
        t.deliver(order); t.finance(order,1,0,30000); t.refund(order,1,30000,true);
        t.db.tx(()->{ t.binding.firstCheckout(t.json(Map.of("checkoutId",order.checkout().toString(),"buyerUserId",buyer.id().toString(),
            "firstQualifyingDelivered",true,"confirmedAt",t.clock.instant().toString(),"evidenceRef","TEST_ONLY_FIRST"))); return null; });
        assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.order_state"));
        assertEquals(0,t.db.count("SELECT count(*) FROM referral_schema.chef_reward"));
        assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.audit WHERE action='ORDER_EXCLUDED' AND target=?",order.id().toString()));
    }

    @Test void pendingSellerRegistrationRetriesInsteadOfExcluding() {
        activateChefPolicy();
        var seller=stranger();
        t.db.update("INSERT INTO referral_schema.inbox(source,event_id,aggregate_id,event_type,payload_hash,payload,next_attempt_at,received_at) VALUES ('auth',?,?,'account.registered',?,'{}'::jsonb,now(),now())",
            UUID.randomUUID(),seller.id(),"0".repeat(64));
        var retry=assertThrows(ReferralProblem.class,()->t.order(seller,t.member(null),30000));
        assertEquals(409,retry.status()); assertEquals("SOURCE_DEPENDENCY_MISSING",retry.getMessage());
        assertEquals(0,excluded());
    }

    @Test void multiChefCheckoutBindsEnrolledSellerAndExcludesTheOther() {
        activateChefPolicy();
        var enrolled=t.member(t.member(null)); var other=stranger(); var buyer=stranger();
        UUID checkout=UUID.randomUUID();
        for(var seller:List.of(enrolled,other)) {
            UUID order=UUID.randomUUID();
            var body=t.json(Map.ofEntries(Map.entry("chefOrderId",order.toString()),Map.entry("checkoutId",checkout.toString()),
                Map.entry("buyerUserId",buyer.id().toString()),Map.entry("sellingChefUserId",seller.id().toString()),
                Map.entry("foodSubtotalPaise","30000"),Map.entry("checkoutFoodSubtotalPaise","60000"),Map.entry("checkoutPayablePaise","60000"),
                Map.entry("chefOrderCount",2),Map.entry("createdAt",t.clock.instant().toString()),
                Map.entry("sourceSnapshotHash",in.craves.referral.infra.Json.sha256(order.toString().getBytes())),Map.entry("currency","INR")));
            t.db.tx(()->{ t.binding.bind(body); return null; });
        }
        assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.order_snapshot WHERE checkout_id=?",checkout));
        assertEquals(1,t.db.count("SELECT count(*) FROM referral_schema.order_exclusion WHERE checkout_id=?",checkout));
    }

    @Test void exclusionsAreGuardedAndImmutable() {
        activateChefPolicy();
        long chefPolicy=t.db.count("SELECT max(id) FROM referral_schema.policy");
        var member=t.member(null);
        String hash="a".repeat(64);
        assertThrows(DataAccessException.class,()->t.db.update("INSERT INTO referral_schema.order_exclusion(order_id,checkout_id,seller_id,policy_id,reason,binding_hash) VALUES (?,?,?,?,'SELLER_NOT_ENROLLED',?)",
            UUID.randomUUID(),UUID.randomUUID(),member.id(),chefPolicy,hash));
        assertThrows(DataAccessException.class,()->t.db.update("INSERT INTO referral_schema.order_exclusion(order_id,checkout_id,seller_id,policy_id,reason,binding_hash) VALUES (?,?,?,?,'SELLER_NOT_ENROLLED',?)",
            UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),t.policy,hash));
        var order=t.order(stranger(),member,30000);
        assertThrows(DataAccessException.class,()->t.db.update("UPDATE referral_schema.order_exclusion SET reason='SELLER_NOT_ENROLLED' WHERE order_id=?",order.id()));
        assertThrows(DataAccessException.class,()->t.db.update("DELETE FROM referral_schema.order_exclusion WHERE order_id=?",order.id()));
        assertThrows(DataAccessException.class,()->t.db.jdbc.execute("TRUNCATE referral_schema.order_exclusion"));
        assertEquals(1,excluded());
    }
}
