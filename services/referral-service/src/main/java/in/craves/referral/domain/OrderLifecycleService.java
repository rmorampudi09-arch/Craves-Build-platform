package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

@Service
public class OrderLifecycleService {
    private final Store db;
    private final ProgramService program;
    private final OrderLocks locks;
    private final ReversalService reversals;
    private final Clock clock;
    public OrderLifecycleService(Store db,ProgramService program,OrderLocks locks,ReversalService reversals,Clock clock) {
        this.db=db; this.program=program; this.locks=locks; this.reversals=reversals; this.clock=clock;
    }
    public void delivered(JsonNode body) {
        Json.fields(body,"chefOrderId","version","deliveredAt","sourceSnapshotHash");
        UUID order=Json.uuid(body,"chefOrderId"); Map<String,Object> state=locks.lockOrder(order);
        Map<String,Object> snapshot=locks.snapshot(order);
        require(snapshot.get("source_hash").equals(ProgramService.hash(body,"sourceSnapshotHash",true)),409,"SOURCE_SNAPSHOT_MISMATCH");
        int version=Json.integer(body,"version",1,Integer.MAX_VALUE); String hash=Json.hash(body);
        if(!locks.newVersion(state,"delivery",version,hash)) return;
        Instant delivered=Json.instant(body,"deliveredAt");
        require(!delivered.isBefore(instant(snapshot,"created_at")) && !delivered.isAfter(clock.instant().plusSeconds(60)),422,"INVALID_DELIVERY_TIME");
        require(instant(state,"delivered_at")==null || instant(state,"delivered_at").equals(delivered),409,"DELIVERY_TIME_CONFLICT");
        db.update("UPDATE referral_schema.order_state SET delivered_at=?,delivery_version=?,delivery_hash=? WHERE order_id=?",time(delivered),version,hash,order);
    }
    public void financeConfirmed(JsonNode body) {
        Json.fields(body,"chefOrderId","version","sourceSnapshotHash","verifiedCapture","capturedCheckoutPaise",
            "commissionBudgetPaise","cumulativeFoodRefundPaise","observedAt","evidenceRef","currency","paidAt");
        UUID order=Json.uuid(body,"chefOrderId"); Map<String,Object> state=locks.lockOrder(order);
        Map<String,Object> snapshot=locks.snapshot(order), checkout=locks.checkout(uuid(snapshot,"checkout_id"));
        int version=Json.integer(body,"version",1,Integer.MAX_VALUE); String hash=Json.hash(body);
        if(!locks.newVersion(state,"finance",version,hash)) return;
        require("INR".equals(Json.text(body,"currency",3)) && snapshot.get("source_hash").equals(ProgramService.hash(body,"sourceSnapshotHash",true)),409,"FINANCE_SOURCE_MISMATCH");
        boolean captured=Json.bool(body,"verifiedCapture");
        long capturedAmount=Json.money(body,"capturedCheckoutPaise"), budget=Json.money(body,"commissionBudgetPaise");
        long refunded=Json.money(body,"cumulativeFoodRefundPaise");
        Instant observed=Json.instant(body,"observedAt"); String evidence=Json.text(body,"evidenceRef",180);
        require(!observed.isBefore(instant(snapshot,"created_at")) && !observed.isAfter(clock.instant().plusSeconds(60))
            && (instant(state,"finance_observed_at")==null || !observed.isBefore(instant(state,"finance_observed_at"))),422,"INVALID_FINANCE_OBSERVATION");
        require(!captured || capturedAmount==number(checkout,"payable_paise"),409,"CAPTURE_AMOUNT_MISMATCH");
        require(budget<=number(snapshot,"food_paise") && refunded<=number(snapshot,"food_paise"),422,"INVALID_FINANCE_AMOUNTS");
        Instant paid=body.hasNonNull("paidAt")?Json.instant(body,"paidAt"):instant(state,"verified_paid_at");
        require(paid==null || (!paid.isBefore(instant(snapshot,"created_at")) && !paid.isAfter(observed)),422,"INVALID_CAPTURE_TIME");
        require(instant(state,"verified_paid_at")==null || instant(state,"verified_paid_at").equals(paid),409,"CAPTURE_TIME_CONFLICT");
        if(captured && paid!=null) db.update("UPDATE referral_schema.order_state SET verified_paid_at=? WHERE order_id=?",time(paid),order);
        db.update("UPDATE referral_schema.order_state SET finance_version=?,finance_hash=?,verified_capture=?,finance_observed_at=?,commission_budget_paise=?,confirmed_refund_paise=? WHERE order_id=?",
            version,hash,captured,time(observed),budget,refunded,order);
        long exposure=db.count("SELECT COALESCE(sum(r.amount_paise-COALESCE((SELECT sum(v.amount_paise) FROM referral_schema.reversal v WHERE v.reward_id=r.id),0)),0) FROM referral_schema.reward r WHERE r.order_id=? AND r.track='UPLINE'",order);
        if(bool(state,"awarded") && (!captured || refunded!=number(state,"refunded_food_paise") || exposure>budget)) {
            for(Map<String,Object> reward:db.rows("SELECT DISTINCT beneficiary_id FROM referral_schema.reward WHERE checkout_id=?",uuid(snapshot,"checkout_id"))) {
                UUID user=uuid(reward,"beneficiary_id");
                program.fraud(user,"finance-mismatch:"+order+":"+version+":"+user,"FINANCE_RECONCILIATION_MISMATCH",evidence);
            }
        }
    }
    public void refunded(JsonNode body) {
        Json.fields(body,"chefOrderId","version","cumulativeFoodRefundPaise","fullCheckoutRefund","reasonRef");
        UUID order=Json.uuid(body,"chefOrderId"); Map<String,Object> state=locks.lockOrder(order);
        Map<String,Object> snapshot=locks.snapshot(order);
        int version=Json.integer(body,"version",1,Integer.MAX_VALUE); String hash=Json.hash(body);
        if(!locks.newVersion(state,"refund",version,hash)) return;
        long refunded=Json.money(body,"cumulativeFoodRefundPaise"); boolean fullCheckout=Json.bool(body,"fullCheckoutRefund");
        require(refunded>=number(state,"refunded_food_paise") && refunded<=number(snapshot,"food_paise"),422,"REFUND_NOT_MONOTONE");
        String reason=Json.text(body,"reasonRef",180);
        db.update("UPDATE referral_schema.order_state SET refunded_food_paise=?,refund_version=?,refund_hash=? WHERE order_id=?",refunded,version,hash,order);
        if(fullCheckout) {
            UUID checkout=uuid(snapshot,"checkout_id");
            db.update("UPDATE referral_schema.checkout SET full_refund=true WHERE checkout_id=?",checkout);
            reversals.fullCheckout(checkout,"full-refund:"+order+":"+version,reason);
        } else reversals.order(order,"refund:"+order+":"+version,reason);
    }
}
