package in.craves.referral;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.domain.*;
import in.craves.referral.infra.*;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import static in.craves.referral.infra.Store.*;

/** All identifiers and evidence are synthetic; the database factory refuses non-disposable targets. */
public final class ReferralTestRig {
    public record Member(UUID id,String code,JsonNode registration) { }
    public record Order(UUID id,UUID checkout,Member seller,Member buyer,long food,long payable,String hash,JsonNode binding) { }
    public static final class MutableClock extends Clock {
        private final AtomicReference<Instant> value=new AtomicReference<>(Instant.parse("2026-09-15T00:00:00Z"));
        public void advance(Duration duration) { value.updateAndGet(at->at.plus(duration)); }
        public void set(Instant at) { value.set(at); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(instant(),zone); }
        @Override public Instant instant() { return value.get(); }
    }
    public final MutableClock clock=new MutableClock();
    public final Store db;
    public final ReferralSettings settings;
    public final ProgramService program;
    public final OrderLocks locks;
    public final OrderBindingService binding;
    public final ReversalService reversals;
    public final OrderLifecycleService lifecycle;
    public final AwardService awards;
    public final SettlementService settlement;
    public final RecipientService recipients;
    public final CashoutService cashouts;
    public final PayoutBatchPlanner planner;
    public final PayoutEvidenceService evidence;
    public final WalletSpendService spending;
    public final InviteeDiscountService discount;
    public final BenefitOperations benefits;
    public final InboxService inbox;
    public final OutboxService outbox;
    public final UUID maker=UUID.randomUUID(), approver=UUID.randomUUID();
    public final long policy;
    public ReferralTestRig() {
        DataSource ds=TestDatabase.reset(); db=new Store(new JdbcTemplate(ds),new DataSourceTransactionManager(ds));
        String disposableKey=Base64.getEncoder().encodeToString("disposable-referral-test-key-only-2026".getBytes(StandardCharsets.US_ASCII));
        settings=new ReferralSettings(true,true,true,true,true,true,"https://craves.in","https://api.craves.in/auth","craves-api","",
            disposableKey,disposableKey,disposableKey,"","","",1000,10000000,100000000,900);
        program=new ProgramService(db,clock,settings); locks=new OrderLocks(db);
        reversals=new ReversalService(db,program,locks,settings);
        binding=new OrderBindingService(db,program,locks,clock); lifecycle=new OrderLifecycleService(db,program,locks,reversals,clock);
        awards=new AwardService(db,program,locks,reversals,settings); settlement=new SettlementService(db,program,locks,reversals,settings,clock);
        recipients=new RecipientService(db,clock,settings); cashouts=new CashoutService(db,program,recipients,settings,clock);
        planner=new PayoutBatchPlanner(db,program,recipients,settings,clock); evidence=new PayoutEvidenceService(db,clock);
        spending=new WalletSpendService(db,program,settings,clock); discount=new InviteeDiscountService(db,program,settings,clock);
        benefits=new BenefitOperations(db,spending,discount,settings);
        inbox=new InboxService(db,new SourceEventRouter(program,binding,lifecycle,recipients,evidence),settings,clock);
        outbox=new OutboxService(db,settings,clock);
        policy=program.createPolicy(maker,policyBody("1",200,120,80));
        program.approvePolicy(approver,policy,clock.instant().plusSeconds(1),0); clock.advance(Duration.ofSeconds(2));
    }
    public JsonNode json(Object value) { return Json.MAPPER.valueToTree(value); }
    public JsonNode policyBody(String expected,int l1,int l2,int l3) {
        Map<String,Object> value=new LinkedHashMap<>();
        value.put("expectedLatestRevision",expected); value.put("l1Bps",l1); value.put("l2Bps",l2); value.put("l3Bps",l3); value.put("capBps",400);
        value.put("holdDays",14); value.put("minimumPaise","80000"); value.put("customerBonusPaise","40000"); value.put("inviteeDiscountPaise","25000");
        value.put("approvals",Map.of("legalReviewRef","TEST_ONLY_LEGAL","termsVersion","TEST_ONLY_TERMS","taxReviewRef","TEST_ONLY_TAX",
            "privacyReviewRef","TEST_ONLY_PRIVACY","fundingReviewRef","TEST_ONLY_BUDGET","multiChefDecisionRef","TEST_ONLY_CHILD_ORDER_MINIMUM","payoutReviewRef","TEST_ONLY_PAYOUT"));
        return json(value);
    }
    public Member member(Member parent) {
        UUID id=UUID.randomUUID(); Map<String,Object> body=new LinkedHashMap<>();
        body.put("userId",id.toString()); body.put("registeredAt",clock.instant().toString()); body.put("parentCode",parent==null?null:parent.code());
        body.put("fingerprintConsent",false); body.put("contactHash",Json.sha256(id.toString().getBytes(StandardCharsets.US_ASCII))); body.put("termsVersion","TEST_ONLY_TERMS");
        JsonNode payload=json(body); db.tx(()->{ program.register(payload); return null; });
        String code=db.one("SELECT code FROM referral_schema.member WHERE user_id=?",id).get("code").toString();
        return new Member(id,code,payload);
    }
    public Order order(Member seller,Member buyer,long food) { return order(seller,buyer,food,food); }
    public Order order(Member seller,Member buyer,long food,long payable) {
        UUID id=UUID.randomUUID(), checkout=UUID.randomUUID();
        String hash=Json.sha256(id.toString().getBytes(StandardCharsets.US_ASCII));
        Map<String,Object> body=new LinkedHashMap<>();
        body.put("chefOrderId",id.toString()); body.put("checkoutId",checkout.toString()); body.put("buyerUserId",buyer.id().toString());
        body.put("sellingChefUserId",seller.id().toString()); body.put("foodSubtotalPaise",Long.toString(food)); body.put("checkoutFoodSubtotalPaise",Long.toString(food));
        body.put("checkoutPayablePaise",Long.toString(payable)); body.put("chefOrderCount",1); body.put("createdAt",clock.instant().toString());
        body.put("sourceSnapshotHash",hash); body.put("currency","INR"); JsonNode payload=json(body);
        db.tx(()->{ binding.bind(payload); return null; });
        return new Order(id,checkout,seller,buyer,food,payable,hash,payload);
    }
    public void deliver(Order order) {
        db.tx(()->{ lifecycle.delivered(delivery(order)); return null; });
    }
    public JsonNode delivery(Order order) {
        return json(Map.of("chefOrderId",order.id().toString(),"version",1,"deliveredAt",clock.instant().toString(),"sourceSnapshotHash",order.hash()));
    }
    public void finance(Order order,int version,long refund,long budget) {
        Map<String,Object> value=new LinkedHashMap<>();
        value.put("chefOrderId",order.id().toString()); value.put("version",version); value.put("sourceSnapshotHash",order.hash());
        value.put("verifiedCapture",true); value.put("capturedCheckoutPaise",Long.toString(order.payable())); value.put("commissionBudgetPaise",Long.toString(budget));
        value.put("cumulativeFoodRefundPaise",Long.toString(refund)); value.put("observedAt",clock.instant().toString()); value.put("evidenceRef","TEST_ONLY_CAPTURE"); value.put("currency","INR");
        db.tx(()->{ lifecycle.financeConfirmed(json(value)); return null; });
    }
    public void refund(Order order,int version,long cumulative,boolean full) {
        db.tx(()->{ lifecycle.refunded(json(Map.of("chefOrderId",order.id().toString(),"version",version,"cumulativeFoodRefundPaise",Long.toString(cumulative),
            "fullCheckoutRefund",full,"reasonRef","TEST_ONLY_REFUND"))); return null; });
    }
    public void fund(String track,long amount) {
        db.tx(()->{ recipients.fund(json(Map.of("fundingId",UUID.randomUUID().toString(),"track",track,"amountPaise",Long.toString(amount),"evidenceRef","TEST_ONLY_FUNDS"))); return null; });
    }
    public void first(Order order) {
        db.tx(()->{ binding.firstCheckout(json(Map.of("checkoutId",order.checkout().toString(),"buyerUserId",order.buyer().id().toString(),
            "firstQualifyingDelivered",true,"confirmedAt",clock.instant().toString(),"evidenceRef","TEST_ONLY_GLOBAL_FIRST_ORDER"))); return null; });
    }
    public void mature(Order order,long refund) {
        clock.advance(Duration.ofDays(15)); finance(order,2,refund,order.food());
        for(Map<String,Object> row:db.rows("SELECT id FROM referral_schema.reward WHERE checkout_id=? ORDER BY id",order.checkout())) settlement.settle(uuid(row,"id"));
    }
    public void assess(Member member) {
        Map<String,Object> body=new LinkedHashMap<>();
        body.put("assessmentId",UUID.randomUUID().toString()); body.put("userId",member.id().toString()); body.put("financialYear",RecipientService.financialYear(clock.instant()));
        body.put("kycVerified",true); body.put("kycExpiresAt",clock.instant().plus(Duration.ofDays(365)).toString()); body.put("destinationRef","TEST_ONLY_DESTINATION:"+member.id());
        body.put("taxAssessmentRef","TEST_ONLY_TAX"); body.put("taxHandling","REVIEWED_AT_CASHOUT"); body.put("cashoutAllowed",true);
        body.put("annualLimitPaise","100000000"); body.put("assessedAt",clock.instant().toString());
        db.tx(()->{ recipients.assess(json(body)); return null; });
    }
    public long balance(Member user,String field) {
        if(!java.util.List.of("pending_paise","available_paise","reserved_paise").contains(field)) throw new IllegalArgumentException();
        return db.count("SELECT "+field+" FROM referral_schema.wallet WHERE user_id=?",user.id());
    }
    public JsonNode envelope(String type,UUID aggregate,JsonNode payload,UUID event) {
        return json(Map.of("eventId",event.toString(),"eventType",type,"aggregateId",aggregate.toString(),"occurredAt",clock.instant().toString(),"payload",payload));
    }
}
