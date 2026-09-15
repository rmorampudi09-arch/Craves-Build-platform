package in.craves.referral.domain;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.infra.Json;
import in.craves.referral.infra.Store;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

/** Records independently verified Finance evidence for an existing attempt; never initiates payment. */
@Service
public class PayoutEvidenceService {
    private final Store db;
    private final Clock clock;
    public PayoutEvidenceService(Store db,Clock clock) { this.db=db; this.clock=clock; }
    public void record(JsonNode body) {
        Json.fields(body,"outcomeId","reservationId","attemptId","outcome","netPaise","withholdingPaise","providerRef","evidenceRef","paidAt");
        UUID event=Json.uuid(body,"outcomeId"), id=Json.uuid(body,"reservationId"), attempt=Json.uuid(body,"attemptId");
        String hash=Json.hash(body), result=Json.text(body,"outcome",20), evidence=Json.text(body,"evidenceRef",180);
        require(List.of("PAID","UNKNOWN","PROVEN_FAILED").contains(result),422,"INVALID_PAYOUT_OUTCOME");
        List<Map<String,Object>> prior=db.rows("SELECT source_hash FROM referral_schema.payout_outcome WHERE event_id=?",event);
        if(!prior.isEmpty()) { require(hash.equals(prior.getFirst().get("source_hash")),409,"PAYOUT_OUTCOME_CONFLICT"); return; }
        UUID user=uuid(db.one("SELECT user_id FROM referral_schema.reservation WHERE id=?",id),"user_id");
        db.lockWallets(List.of(user));
        Map<String,Object> row=db.one("SELECT * FROM referral_schema.reservation WHERE id=? FOR UPDATE",id);
        require(row.get("kind").equals("CASHOUT") && attempt.equals(uuid(row,"attempt_id")),409,"PAYOUT_ATTEMPT_MISMATCH");
        long net=Json.money(body,"netPaise"), tax=Json.money(body,"withholdingPaise");
        require(net==number(row,"net_paise") && tax==number(row,"withholding_paise"),409,"PAYOUT_AMOUNT_MISMATCH");
        String provider=Json.optionalText(body,"providerRef",180); Instant paid=null;
        if(result.equals("PAID")) {
            require(provider!=null,422,"PAYMENT_REFERENCE_REQUIRED"); paid=Json.instant(body,"paidAt");
            require(!paid.isAfter(clock.instant().plusSeconds(60)) && !paid.isBefore(instant(row,"requested_at")),422,"INVALID_PAYMENT_TIME");
        } else require(!body.hasNonNull("paidAt"),422,"PAID_TIME_ON_UNPAID_OUTCOME");
        String status=row.get("status").toString();
        if(status.equals("PAID") || status.equals("RELEASED")) {
            require((status.equals("PAID") && result.equals("PAID") && provider.equals(row.get("provider_ref")) && paid.equals(instant(row,"paid_at")))
                || (status.equals("RELEASED") && result.equals("PROVEN_FAILED")),409,"TERMINAL_PAYOUT_CONFLICT");
        } else {
            require(List.of("SUBMITTED","UNKNOWN").contains(status),409,"PAYOUT_NOT_SUBMITTED");
            if(result.equals("PAID")) {
                db.journal("payout-net:"+id,user,0,0,-net,"PAYOUT_CLEARING",null,id);
                if(tax>0) db.journal("payout-tax:"+id,user,0,0,-tax,"WITHHOLDING_CLEARING",null,id);
                db.update("UPDATE referral_schema.reservation SET status='PAID',provider_ref=?,paid_at=?,updated_at=? WHERE id=?",provider,time(paid),time(clock.instant()),id);
            } else if(result.equals("PROVEN_FAILED")) {
                long gross=number(row,"amount_paise");
                db.journal("release:"+id,user,0,gross,-gross,"INTERNAL_TRANSFER",null,id);
                db.update("UPDATE referral_schema.reservation SET status='RELEASED',provider_ref=?,updated_at=? WHERE id=?",provider,time(clock.instant()),id);
            } else if(status.equals("SUBMITTED")) {
                db.update("UPDATE referral_schema.reservation SET status='UNKNOWN',updated_at=? WHERE id=?",time(clock.instant()),id);
            }
        }
        db.update("INSERT INTO referral_schema.payout_outcome(event_id,reservation_id,attempt_id,outcome,source_hash,evidence_ref) VALUES (?,?,?,?,?,?)",event,id,attempt,result,hash,evidence);
        db.audit("source:finance","PAYOUT_"+result,id.toString(),Map.of("attemptId",attempt.toString(),"evidenceRef",evidence));
    }
}
