package in.craves.referral;

import in.craves.referral.erasure.AccountErasureService;
import in.craves.referral.erasure.AccountErasureService.Result;
import in.craves.referral.erasure.AccountErasureService.Scope;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static in.craves.referral.infra.Store.*;
import static org.junit.jupiter.api.Assertions.*;

/** Disposable PostgreSQL only (same gate as SchemaIT): real triggers, so every write here is one the ledger accepts. */
class AccountErasureIT {
    ReferralTestRig r;
    AccountErasureService erasure;
    @BeforeEach void setup() { r=new ReferralTestRig(); erasure=new AccountErasureService(r.db); }

    /** A member whose wallet holds 2000 paise of available credit, as in ReferralHttpContractIT. */
    ReferralTestRig.Member memberWithCredit() {
        var owner=r.member(null);var seller=r.member(owner);var buyer=r.member(null);var order=r.order(seller,buyer,100000);
        r.deliver(order);r.finance(order,1,0,7000);r.awards.award(order.id());r.mature(order,0);
        assertEquals(2000,r.balance(owner,"available_paise"));
        return owner;
    }
    /** The whole row as text: a plain row map cannot be compared because its uuid[] column is a driver object. */
    String memberJson(UUID id) { return r.db.one("SELECT to_jsonb(m)::text AS j FROM referral_schema.member m WHERE user_id=?",id).get("j").toString(); }
    /** One more order under the owner, awarded but not yet matured: the owner gets a PENDING reward of 2000. */
    ReferralTestRig.Order pendingReward(ReferralTestRig.Member owner) {
        var order=r.order(r.member(owner),r.member(null),100000);
        r.deliver(order);r.finance(order,1,0,7000);r.awards.award(order.id());
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE beneficiary_id=? AND status='PENDING'",owner.id()));
        return order;
    }
    static List<String> codes(List<AccountErasureService.Blocker> blockers) { return blockers.stream().map(AccountErasureService.Blocker::code).toList(); }
    long journalRows() { return r.db.count("SELECT count(*) FROM referral_schema.journal"); }
    boolean active(ReferralTestRig.Member m) { return bool(r.db.one("SELECT is_active FROM referral_schema.member WHERE user_id=?",m.id()),"is_active"); }
    void assertAllZero(Result result) { assertTrue(result.done());assertFalse(result.counts().isEmpty());result.counts().values().forEach(n->assertEquals(0,n)); }

    @Test void openFraudCaseBlocksEraseAndNothingChanges() {
        var owner=memberWithCredit();long journal=journalRows();
        for(Scope scope:Scope.values()) assertTrue(erasure.blockers(owner.id(),scope).isEmpty());
        r.program.fraud(owner.id(),"test-case:"+owner.id(),"DUPLICATE_IDENTITY_SIGNAL","TEST_ONLY");
        for(Scope scope:Scope.values()) {
            var blockers=erasure.blockers(owner.id(),scope);
            assertEquals(List.of("FRAUD_CASE_OPEN"),codes(blockers));
            assertFalse(blockers.getFirst().detail().isBlank());
            var result=erasure.erase(UUID.randomUUID(),owner.id(),scope);
            assertFalse(result.done());assertEquals(blockers,result.blockers());
        }
        assertEquals(2000,r.balance(owner,"available_paise"));assertTrue(active(owner));assertEquals(journal,journalRows());
    }
    @Test void aReviewedFraudCaseDoesNotBlock() {
        var owner=memberWithCredit();
        r.program.fraud(owner.id(),"test-case:"+owner.id(),"DUPLICATE_IDENTITY_SIGNAL","TEST_ONLY");
        UUID id=uuid(r.db.one("SELECT id FROM referral_schema.fraud_case WHERE user_id=?",owner.id()),"id");
        r.program.resolveFraud(UUID.randomUUID(),id,true,"TEST_ONLY_REVIEW");
        assertTrue(erasure.blockers(owner.id(),Scope.ALL).isEmpty());
        assertTrue(erasure.erase(UUID.randomUUID(),owner.id(),Scope.ALL).done());
    }
    @Test void eraseForfeitsCustomerCreditsWithOneJournalEntry() {
        var owner=memberWithCredit();
        var before=r.db.rows("SELECT * FROM referral_schema.journal ORDER BY id");long wallet=r.balance(owner,"pending_paise");
        var result=erasure.erase(UUID.randomUUID(),owner.id(),Scope.CUSTOMER);
        assertTrue(result.done());assertEquals(Map.of("journal",1,"member",0),result.counts());
        assertEquals(0,r.balance(owner,"available_paise"));assertEquals(wallet,r.balance(owner,"pending_paise"));
        var after=r.db.rows("SELECT * FROM referral_schema.journal ORDER BY id");
        assertEquals(before.size()+1,after.size());
        assertEquals(before,after.subList(0,before.size()),"no existing journal row may change");
        var entry=after.getLast();
        assertEquals(owner.id(),uuid(entry,"user_id"));assertEquals(-2000,number(entry,"available_delta"));assertEquals(2000,number(entry,"counterparty_delta"));
        assertEquals(0,number(entry,"pending_delta")+number(entry,"reserved_delta"));assertTrue(entry.get("event_key").toString().startsWith("forfeit:"));
        assertEquals(1,r.db.count("SELECT count(*) FROM referral_schema.outbox WHERE event_key=?","journal:"+number(entry,"id")),"finance still gets the entry");
    }
    @Test void aCashOutThatIsNotFinishedBlocksCustomerAndAllAndNothingChanges() {
        var owner=memberWithCredit();r.assess(owner);UUID cashout=UUID.randomUUID();
        r.cashouts.request(owner.id(),cashout,1500);
        assertEquals(500,r.balance(owner,"available_paise"));assertEquals(1500,r.balance(owner,"reserved_paise"));
        long journal=journalRows();var reservation=r.db.rows("SELECT * FROM referral_schema.reservation");String member=memberJson(owner.id());
        for(Scope scope:List.of(Scope.CUSTOMER,Scope.ALL)) {
            var blockers=erasure.blockers(owner.id(),scope);
            assertEquals(List.of("CASH_OUT_IN_FLIGHT"),codes(blockers));assertFalse(blockers.getFirst().detail().isBlank());
            var result=erasure.erase(UUID.randomUUID(),owner.id(),scope);
            assertFalse(result.done());assertEquals(blockers,result.blockers());
        }
        assertTrue(erasure.blockers(owner.id(),Scope.CHEF).isEmpty());
        assertAllZero(erasure.erase(UUID.randomUUID(),owner.id(),Scope.CHEF));
        assertEquals(500,r.balance(owner,"available_paise"));assertEquals(1500,r.balance(owner,"reserved_paise"));
        assertEquals(journal,journalRows());assertEquals(reservation,r.db.rows("SELECT * FROM referral_schema.reservation"));assertEquals(member,memberJson(owner.id()));
        r.cashouts.cancel(owner.id(),cashout);
        assertTrue(erasure.blockers(owner.id(),Scope.ALL).isEmpty());
        assertEquals(Map.of("journal",1,"member",1),erasure.erase(UUID.randomUUID(),owner.id(),Scope.ALL).counts());
        assertEquals(0,r.balance(owner,"available_paise"));assertEquals(0,r.balance(owner,"reserved_paise"));
    }
    @Test void everyUnfinishedCashOutStatusBlocksAndPaidDoesNot() {
        var owner=memberWithCredit();r.assess(owner);UUID cashout=UUID.randomUUID();
        r.cashouts.request(owner.id(),cashout,1500);
        // The same steps the payout code takes, in the order the reservation guard allows.
        String[][] steps={{"RESERVED",null},
            {"APPROVED","UPDATE referral_schema.reservation SET status='APPROVED',net_paise=1500,withholding_paise=0,approved_by=gen_random_uuid(),approval_ref='TEST_ONLY' WHERE id=?"},
            {"SUBMITTED","UPDATE referral_schema.reservation SET status='SUBMITTED',attempt_id=gen_random_uuid() WHERE id=?"},
            {"UNKNOWN","UPDATE referral_schema.reservation SET status='UNKNOWN' WHERE id=?"},
            {"PAID","UPDATE referral_schema.reservation SET status='PAID',provider_ref='TEST_ONLY_REF',paid_at=now() WHERE id=?"}};
        for(String[] step:steps) {
            if(step[1]!=null) r.db.update(step[1],cashout);
            assertEquals(step[0],r.db.one("SELECT status FROM referral_schema.reservation WHERE id=?",cashout).get("status"));
            assertEquals(step[0].equals("PAID")?List.of():List.of("CASH_OUT_IN_FLIGHT"),codes(erasure.blockers(owner.id(),Scope.CUSTOMER)),step[0]);
        }
    }
    @Test void aPendingRewardBlocksAllButNotCustomerOrChef() {
        var owner=memberWithCredit();var order=pendingReward(owner);
        assertEquals(2000,r.balance(owner,"pending_paise"));
        long journal=journalRows();String member=memberJson(owner.id());
        var blockers=erasure.blockers(owner.id(),Scope.ALL);
        assertEquals(List.of("REWARD_PENDING"),codes(blockers));assertFalse(blockers.getFirst().detail().isBlank());
        var blocked=erasure.erase(UUID.randomUUID(),owner.id(),Scope.ALL);
        assertFalse(blocked.done());assertEquals(blockers,blocked.blockers());
        assertEquals(2000,r.balance(owner,"available_paise"));assertEquals(journal,journalRows());assertEquals(member,memberJson(owner.id()));
        // One side only never retires the member, so its pending reward still credits a live account: not a blocker.
        assertTrue(erasure.blockers(owner.id(),Scope.CHEF).isEmpty());assertTrue(erasure.blockers(owner.id(),Scope.CUSTOMER).isEmpty());
        assertAllZero(erasure.erase(UUID.randomUUID(),owner.id(),Scope.CHEF));
        var rewards=r.db.rows("SELECT * FROM referral_schema.reward ORDER BY id");
        assertEquals(Map.of("journal",1,"member",0),erasure.erase(UUID.randomUUID(),owner.id(),Scope.CUSTOMER).counts());
        assertEquals(0,r.balance(owner,"available_paise"));assertEquals(2000,r.balance(owner,"pending_paise"));
        assertEquals(rewards,r.db.rows("SELECT * FROM referral_schema.reward ORDER BY id"));assertTrue(active(owner));
        // Once the reward is credited it is available balance, which ALL forfeits.
        r.mature(order,0);
        assertEquals(0,r.db.count("SELECT count(*) FROM referral_schema.reward WHERE beneficiary_id=? AND status='PENDING'",owner.id()));
        assertTrue(erasure.blockers(owner.id(),Scope.ALL).isEmpty());
        assertEquals(Map.of("journal",1,"member",1),erasure.erase(UUID.randomUUID(),owner.id(),Scope.ALL).counts());
        assertEquals(0,r.balance(owner,"available_paise"));assertFalse(active(owner));
    }
    @Test void aPendingRewardOfAMemberThatIsAlreadyInactiveDoesNotBlock() {
        var owner=r.member(null);pendingReward(owner);
        r.program.status(r.json(Map.of("userId",owner.id().toString(),"version",2,"active",false,"reasonRef","TEST_ONLY")));
        assertFalse(active(owner));assertTrue(erasure.blockers(owner.id(),Scope.ALL).isEmpty());
    }
    @Test void eraseKeepsFraudHashes() {
        UUID id=UUID.randomUUID();String a="a".repeat(64),b="b".repeat(64),c="c".repeat(64);
        r.db.update("INSERT INTO referral_schema.member(user_id,code,path,registered_at,contact_hash,device_hash,payment_hash,fingerprint_consent,terms_version,registration_hash) VALUES (?,'ABCDEFGHJKLMNPQR',?::uuid[],now(),?,?,?,true,'test','hash')",id,"{"+id+"}",a,b,c);
        r.db.update("INSERT INTO referral_schema.wallet(user_id) VALUES (?)",id);
        var before=r.db.one("SELECT * FROM referral_schema.member WHERE user_id=?",id);
        var result=erasure.erase(UUID.randomUUID(),id,Scope.ALL);
        assertEquals(Map.of("journal",0,"member",1),result.counts());
        var after=r.db.one("SELECT * FROM referral_schema.member WHERE user_id=?",id);
        assertEquals(a,after.get("contact_hash"));assertEquals(b,after.get("device_hash"));assertEquals(c,after.get("payment_hash"));
        assertEquals(before.get("code"),after.get("code"));assertEquals(before.get("path").toString(),after.get("path").toString());
        assertEquals(false,after.get("is_active"));
    }
    @Test void retiredCodeCannotBeRedeemed() {
        var owner=r.member(null);
        assertEquals(1,erasure.erase(UUID.randomUUID(),owner.id(),Scope.ALL).counts().get("member"));
        var problem=assertThrows(ReferralProblem.class,()->r.member(owner));
        assertEquals("INVALID_REFERRAL_PARENT",problem.getMessage());
        assertThrows(ReferralProblem.class,()->r.program.code(owner.id()));
        // A later auth status event, even one that says active again, cannot reopen it.
        r.program.status(r.json(Map.of("userId",owner.id().toString(),"version",99,"active",true,"reasonRef","TEST_ONLY")));
        assertFalse(active(owner));
        assertEquals(409,assertThrows(ReferralProblem.class,()->r.program.status(r.json(Map.of("userId",owner.id().toString(),"version",Integer.MAX_VALUE,"active",true,"reasonRef","TEST_ONLY")))).status());
        assertFalse(active(owner));
        assertThrows(ReferralProblem.class,()->r.member(owner));
    }
    @Test void eraseTwiceIsDoneWithZeroCounts() {
        var owner=memberWithCredit();UUID request=UUID.randomUUID();
        assertEquals(Map.of("journal",1,"member",1),erasure.erase(request,owner.id(),Scope.ALL).counts());
        var member=memberJson(owner.id());long journal=journalRows(),audit=r.db.count("SELECT count(*) FROM referral_schema.audit");
        assertAllZero(erasure.erase(request,owner.id(),Scope.ALL));
        assertEquals(member,memberJson(owner.id()));
        assertEquals(journal,journalRows());assertEquals(audit,r.db.count("SELECT count(*) FROM referral_schema.audit"));
    }
    @Test void customerScopeKeepsTheCodeAndChefScopeChangesNothing() {
        var owner=memberWithCredit();long journal=journalRows();
        assertAllZero(erasure.erase(UUID.randomUUID(),owner.id(),Scope.CHEF));
        assertEquals(2000,r.balance(owner,"available_paise"));assertEquals(journal,journalRows());assertTrue(active(owner));
        assertEquals(Map.of("journal",1,"member",0),erasure.erase(UUID.randomUUID(),owner.id(),Scope.CUSTOMER).counts());
        assertTrue(active(owner));assertNotNull(r.member(owner),"the code of a one-side erase still works");
    }
    @Test void aCreditThatReturnsAfterEraseIsForfeitedUnderItsOwnKey() {
        var owner=memberWithCredit();
        erasure.erase(UUID.randomUUID(),owner.id(),Scope.ALL);
        r.db.journal("spend-refund:test:1",owner.id(),0,300,0,"CHECKOUT_CLEARING",null,UUID.randomUUID());
        assertEquals(300,r.balance(owner,"available_paise"));
        assertEquals(1,erasure.erase(UUID.randomUUID(),owner.id(),Scope.CUSTOMER).counts().get("journal"));
        assertEquals(0,r.balance(owner,"available_paise"));
        assertEquals(2,r.db.count("SELECT count(*) FROM referral_schema.journal WHERE event_key LIKE 'forfeit:%'"));
    }
    @Test void aPersonWithNoReferralRecordIsDoneWithZeroCounts() {
        UUID stranger=UUID.randomUUID();
        for(Scope scope:Scope.values()) assertTrue(erasure.blockers(stranger,scope).isEmpty());
        for(Scope scope:Scope.values()) assertAllZero(erasure.erase(UUID.randomUUID(),stranger,scope));
    }
    @Test void aSchemaThatWasNeverCreatedIsNothingToErase() {
        r.db.jdbc.execute("DROP SCHEMA referral_schema CASCADE");
        UUID id=UUID.randomUUID();
        assertTrue(erasure.blockers(id,Scope.ALL).isEmpty());
        assertTrue(erasure.erase(UUID.randomUUID(),id,Scope.ALL).done());
    }
}
