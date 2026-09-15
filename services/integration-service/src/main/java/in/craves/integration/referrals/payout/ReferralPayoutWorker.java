package in.craves.integration.referrals.payout;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.referrals.transport.ReferralOutbox;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** One durable submit per attempt. Uncertain submissions need reconciliation of the original transfer. */
@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralPayoutWorker {
    record Work(UUID attempt,UUID lease,String fund,String contact,long net,long tax,String provider,int attempts) {
        RazorpayXPayoutClient.Instruction instruction(){return new RazorpayXPayoutClient.Instruction(attempt,fund,BigDecimal.valueOf(net,2).toPlainString(),provider);}
    }
    public record Reconcile(String providerId,String evidenceRef,String reason) {}
    private final JdbcTemplate db;private final ObjectMapper json;private final RazorpayXPayoutClient provider;
    private final ReferralOutbox outbox;private final LedgerPostingService ledger;private final TransactionTemplate tx;private final boolean enabled;
    public ReferralPayoutWorker(JdbcTemplate db,ObjectMapper json,RazorpayXPayoutClient provider,ReferralOutbox outbox,LedgerPostingService ledger,PlatformTransactionManager manager,
        @Value("${CRAVES_REFERRAL_PAYOUT_EXECUTION_ENABLED:false}") boolean enabled) {
        this.db=db;this.json=json;this.provider=provider;this.outbox=outbox;this.ledger=ledger;this.tx=new TransactionTemplate(manager);this.enabled=enabled;
    }
    @Scheduled(fixedDelayString="${CRAVES_REFERRAL_PAYOUT_POLL_MS:5000}")
    public void tick(){if(!enabled || !provider.ready())return;for(int i=0;i<10;i++){try{if(!runOne())return;}catch(RuntimeException e){return;}}}
    public boolean runOne() {
        if(!enabled || !provider.ready())return false;
        freezeOne();Work work=claim();if(work==null)return false;
        try {
            // Verification or transport failure after the claim is uncertain: never automatically POST it again.
            RazorpayXPayoutClient.Receipt receipt;
            if(work.provider()==null){provider.verifyFundAccount(work.fund(),work.contact());receipt=provider.submitReferral(work.instruction());}
            else receipt=provider.fetch(work.instruction());
            finish(work,receipt);
        }catch(RuntimeException e){uncertain(work,"PROVIDER_RESULT_UNCONFIRMED");}
        return true;
    }
    void freezeOne() {
        tx.executeWithoutResult(s->{
            var rows=db.queryForList("""
                SELECT i.*,r.id AS review_id,r.provider_binding::text AS binding,r.payload::text AS assessment
                FROM payment_schema.referral_payout_instruction i JOIN payment_schema.referral_finance_review r
                  ON r.kind='RECIPIENT' AND r.approved_by IS NOT NULL AND r.payload->>'assessmentId'=i.payload->>'assessmentId'
                WHERE i.state='AWAITING_PROVIDER_REVIEW' AND NOT EXISTS(SELECT 1 FROM payment_schema.referral_payout_execution e WHERE e.attempt_id=i.attempt_id)
                  AND (r.payload->>'kycExpiresAt')::timestamptz>now()
                ORDER BY i.created_at,i.attempt_id LIMIT 1 FOR UPDATE OF i SKIP LOCKED
                """);
            if(rows.isEmpty())return;var row=rows.getFirst();JsonNode p=parse(row.get("payload")),a=parse(row.get("assessment")),b=parse(row.get("binding"));
            long net=ReferralFinanceReviewService.positive(p,"netPaise"),gross=ReferralFinanceReviewService.positive(p,"grossPaise"),tax=zeroOrPositive(p,"withholdingPaise");
            if(gross!=Math.addExact(net,tax) || !"INR".equals(p.path("currency").asText())
                || !row.get("user_id").toString().equals(a.path("userId").asText()) || !row.get("user_id").toString().equals(p.path("beneficiaryUserId").asText())
                || !row.get("reservation_id").toString().equals(p.path("reservationId").asText()) || !row.get("attempt_id").toString().equals(p.path("attemptId").asText())
                || !p.path("destinationRef").asText().equals(a.path("destinationRef").asText()) || !a.path("cashoutAllowed").asBoolean() || !a.path("kycVerified").asBoolean())
                throw new IllegalStateException("REFERRAL_PAYOUT_REVIEW_MISMATCH");
            UUID attempt=(UUID)row.get("attempt_id");
            db.update("INSERT INTO payment_schema.referral_payout_execution(attempt_id,review_id,fund_account_id,contact_id,net_paise,withholding_paise,state) VALUES (?,?,?,?,?,?,'READY')",attempt,row.get("review_id"),b.path("fundAccountId").asText(),b.path("contactId").asText(),net,tax);
            db.update("UPDATE payment_schema.referral_payout_instruction SET state='EXECUTION_RECORDED' WHERE attempt_id=?",attempt);
        });
    }
    Work claim(){return tx.execute(s->{
        db.update("UPDATE payment_schema.referral_payout_execution SET state='UNKNOWN',lease_id=NULL,lease_until=NULL,last_code='WORKER_LEASE_EXPIRED' WHERE state IN ('SENDING','RECONCILING') AND lease_until<=now()");
        var rows=db.queryForList("""
            SELECT e.* FROM payment_schema.referral_payout_execution e
            JOIN payment_schema.referral_finance_review r ON r.id=e.review_id
            WHERE e.next_attempt_at<=now() AND e.attempts<40
              AND ((e.state='READY' AND (r.payload->>'kycExpiresAt')::timestamptz>now()) OR (e.state='UNKNOWN' AND e.provider_id IS NOT NULL))
            ORDER BY e.next_attempt_at,e.attempt_id LIMIT 1 FOR UPDATE OF e SKIP LOCKED
            """);
        if(rows.isEmpty())return null;var r=rows.getFirst();UUID id=(UUID)r.get("attempt_id"),lease=UUID.randomUUID();String providerId=(String)r.get("provider_id");
        db.update("UPDATE payment_schema.referral_payout_execution SET state=?,lease_id=?,lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE attempt_id=?",providerId==null?"SENDING":"RECONCILING",lease,id);
        return new Work(id,lease,r.get("fund_account_id").toString(),r.get("contact_id").toString(),((Number)r.get("net_paise")).longValue(),((Number)r.get("withholding_paise")).longValue(),providerId,((Number)r.get("attempts")).intValue()+1);
    });}
    private boolean owns(Work w){return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.referral_payout_execution WHERE attempt_id=? AND lease_id=? AND lease_until>now() AND state IN ('SENDING','RECONCILING') FOR UPDATE)",Boolean.class,w.attempt(),w.lease()));}
    void finish(Work w,RazorpayXPayoutClient.Receipt receipt){tx.executeWithoutResult(s->{
        if(!owns(w))return;Instant now=Instant.now();
        if(receipt==null || receipt.payoutId()==null || !receipt.payoutId().matches("pout_[A-Za-z0-9]+") || (w.provider()!=null && !w.provider().equals(receipt.payoutId())))throw new IllegalStateException("PAYOUT_ID_MISMATCH");
        boolean paid="processed".equals(receipt.status()) && receipt.transferReference()!=null && !receipt.transferReference().isBlank();
        // A failed GET of the exact original payout proves failure. Reversed/other statuses need manual evidence.
        boolean failed=w.provider()!=null && "failed".equals(receipt.status()) && (receipt.transferReference()==null || receipt.transferReference().isBlank());
        String state=paid?"PAID":failed?"FAILED":w.attempts()>=40?"REVIEW":"UNKNOWN";
        if(paid){
            var amount=BigDecimal.valueOf(w.net(),2);var entry=new LedgerJournal.Entry("referral-provider-paid/"+w.attempt(),stable(w.attempt(),"ledger"),"referral-finance","REFERRAL_PROVIDER_PAID",null,null,"INR",now,"razorpayx/"+receipt.payoutId(),null,"SERVICE","referral-payout-worker",
                List.of(LedgerJournal.Line.debit("REFERRAL_PAYOUT_CLEARING",amount,null),LedgerJournal.Line.credit("PAYOUT_CLEARING",amount,null)));
            if(ledger.post(entry).outcome()==LedgerJournal.Outcome.CONFLICT)throw new IllegalStateException("REFERRAL_PROVIDER_LEDGER_CONFLICT");
        }
        outcome(w,paid?"PAID":failed?"PROVEN_FAILED":"UNKNOWN",receipt.payoutId(),receipt.transferReference(),now,"SERVICE","razorpayx/"+receipt.payoutId());
        db.update("UPDATE payment_schema.referral_payout_execution SET state=?,provider_id=?,transfer_reference=?,observed_at=?,lease_id=NULL,lease_until=NULL,next_attempt_at=now()+interval '60 seconds',last_code=? WHERE attempt_id=?",state,receipt.payoutId(),receipt.transferReference(),Timestamp.from(now),paid?"PROVIDER_PROCESSED":failed?"PROVIDER_FAILED":"PROVIDER_NONTERMINAL",w.attempt());
    });}
    void uncertain(Work w,String code){tx.executeWithoutResult(s->{
        if(!owns(w))return;Instant now=Instant.now();outcome(w,"UNKNOWN",w.provider(),null,now,"SERVICE","referral-attempt/"+w.attempt());
        db.update("UPDATE payment_schema.referral_payout_execution SET state=?,lease_id=NULL,lease_until=NULL,next_attempt_at=now()+interval '60 seconds',last_code=? WHERE attempt_id=?",w.attempts()>=40?"REVIEW":"UNKNOWN",code,w.attempt());
    });}
    private void outcome(Work w,String result,String providerId,String transfer,Instant now,String actor,String evidence){
        UUID id=stable(w.attempt(),result);
        if(db.update("INSERT INTO payment_schema.referral_payout_evidence(id,attempt_id,outcome,provider_id,transfer_reference,observed_at,actor_id,evidence_ref) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(attempt_id,outcome) DO NOTHING",id,w.attempt(),result,providerId,transfer,Timestamp.from(now),actor,evidence)==0)return;
        UUID reservation=db.queryForObject("SELECT reservation_id FROM payment_schema.referral_payout_instruction WHERE attempt_id=?",UUID.class,w.attempt());
        var payload=json.createObjectNode().put("outcomeId",id.toString()).put("attemptId",w.attempt().toString()).put("reservationId",reservation.toString()).put("outcome",result).put("netPaise",Long.toString(w.net())).put("withholdingPaise",Long.toString(w.tax())).put("evidenceRef",evidence);
        if(providerId!=null)payload.put("providerRef",providerId);if("PAID".equals(result))payload.put("paidAt",now.toString());
        outbox.enqueue("payout-outcome/"+id,"payout.outcome",reservation,now,payload);
    }
    public Map<String,String> reconcile(CravesPrincipal actor,UUID attempt,Reconcile request){
        FinancePolicyService.operator(actor);if(request==null || request.providerId()==null || !request.providerId().matches("pout_[A-Za-z0-9]+"))throw ReferralFinanceReviewService.bad("Original provider payout ID required");
        FinancePolicyService.reason(request.reason());ReferralFinanceReviewService.reference(request.evidenceRef());
        var r=db.queryForMap("SELECT * FROM payment_schema.referral_payout_execution WHERE attempt_id=?",attempt);
        Work w=new Work(attempt,null,r.get("fund_account_id").toString(),r.get("contact_id").toString(),((Number)r.get("net_paise")).longValue(),((Number)r.get("withholding_paise")).longValue(),request.providerId(),0);
        provider.fetch(w.instruction()); // Verifies original reference, amount, currency and frozen destination; it never submits.
        tx.executeWithoutResult(s->{
            var locked=db.queryForMap("SELECT * FROM payment_schema.referral_payout_execution WHERE attempt_id=? FOR UPDATE",attempt);
            if(!Set.of("UNKNOWN","REVIEW").contains(locked.get("state")))throw ReferralFinanceReviewService.conflict("Only unresolved transfers can be reconciled");
            if(locked.get("provider_id")!=null && !locked.get("provider_id").equals(request.providerId()))throw ReferralFinanceReviewService.conflict("Original provider identity cannot change");
            db.update("INSERT INTO payment_schema.referral_payout_evidence(id,attempt_id,outcome,provider_id,observed_at,actor_id,evidence_ref) VALUES (?,?,'IDENTIFIED',?,now(),?,?) ON CONFLICT(attempt_id,outcome) DO NOTHING",UUID.randomUUID(),attempt,request.providerId(),actor.identityId().toString(),request.evidenceRef());
            db.update("UPDATE payment_schema.referral_payout_execution SET provider_id=?,state='UNKNOWN',attempts=0,next_attempt_at=now(),last_code='OPERATOR_IDENTIFIED_ORIGINAL_TRANSFER' WHERE attempt_id=?",request.providerId(),attempt);
        });return Map.of("status","ORIGINAL_TRANSFER_QUEUED_FOR_VERIFICATION");
    }
    public List<Map<String,Object>> list(CravesPrincipal actor,int limit){FinancePolicyService.reader(actor);if(limit<1 || limit>100)throw ReferralFinanceReviewService.bad("Limit must be 1..100");return db.queryForList("SELECT i.attempt_id,i.reservation_id,i.user_id,i.state AS instruction_state,e.state,e.provider_id,e.last_code,e.attempts,e.created_at,e.observed_at FROM payment_schema.referral_payout_instruction i LEFT JOIN payment_schema.referral_payout_execution e ON e.attempt_id=i.attempt_id ORDER BY i.created_at DESC,i.attempt_id DESC LIMIT ?",limit);}
    static long zeroOrPositive(JsonNode p,String field){if(!p.path(field).isTextual() || !p.path(field).asText().matches("0|[1-9][0-9]{0,12}"))throw ReferralFinanceReviewService.bad("Exact paise required");return Long.parseLong(p.path(field).asText());}
    private JsonNode parse(Object value){try{return json.readTree(value.toString());}catch(Exception e){throw new IllegalStateException("Invalid payout evidence",e);}}
    private static UUID stable(UUID id,String kind){return UUID.nameUUIDFromBytes(("referral/"+id+"/"+kind).getBytes(StandardCharsets.UTF_8));}
}
