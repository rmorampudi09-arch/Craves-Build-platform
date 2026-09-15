package in.craves.integration.referrals.payout;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.finance.source.FinancialJson;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.referrals.transport.ReferralOutbox;
import in.craves.integration.security.CravesPrincipal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Human review of actual evidence, then a different operator approves exactly that immutable hash. */
@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralFinanceReviewService {
    public record Draft(String kind,JsonNode payload,String fundAccountId,String contactId,String evidenceRef,String reason) {}
    public record Approval(String expectedHash,String reason) {}
    private final JdbcTemplate db; private final ObjectMapper json; private final ReferralOutbox outbox;
    private final RazorpayXPayoutClient provider; private final TransactionTemplate tx;
    public ReferralFinanceReviewService(JdbcTemplate db,ObjectMapper json,ReferralOutbox outbox,RazorpayXPayoutClient provider,PlatformTransactionManager manager) {
        this.db=db;this.json=json;this.outbox=outbox;this.provider=provider;this.tx=new TransactionTemplate(manager);
    }
    public Map<String,Object> draft(CravesPrincipal actor,Draft request) {
        FinancePolicyService.operator(actor);
        if(request==null)throw bad("Review context is required");
        String reason=FinancePolicyService.reason(request.reason());String evidence=reference(request.evidenceRef());
        var payload=request.payload();validate(request.kind(),payload);
        var binding=json.createObjectNode().put("reason",reason);
        if("RECIPIENT".equals(request.kind())) {
            provider.verifyFundAccount(request.fundAccountId(),request.contactId());
            binding.put("fundAccountId",request.fundAccountId()).put("contactId",request.contactId());
        } else if(request.fundAccountId()!=null || request.contactId()!=null)throw bad("Funding review cannot set a beneficiary");
        String hash=FinancialJson.hash(json.createObjectNode().put("kind",request.kind()).put("evidenceRef",evidence).set("content",json.createObjectNode().set("payload",payload)),json);
        // Include the destination, reason and bank verification context in the approver's digest.
        hash=FinancialJson.hash(json.createObjectNode().put("reviewHash",hash).set("binding",binding),json);
        UUID id=UUID.randomUUID();String finalHash=hash;
        tx.executeWithoutResult(s->db.update("INSERT INTO payment_schema.referral_finance_review(id,kind,payload,provider_binding,content_hash,evidence_ref,created_by) VALUES (?,?,?::jsonb,?::jsonb,?,?,?)",id,request.kind(),payload.toString(),binding.toString(),finalHash,evidence,actor.identityId()));
        return Map.of("id",id,"contentHash",hash,"status","AWAITING_SECOND_OPERATOR");
    }
    public Map<String,Object> approve(CravesPrincipal actor,UUID id,Approval request) {
        FinancePolicyService.operator(actor);if(request==null)throw bad("Approval is required");
        FinancePolicyService.reason(request.reason());
        // Recheck provider context outside the transaction; no network occurs while holding database locks.
        var original=load(id);var body=parse(original.get("payload"));var binding=parse(original.get("provider_binding"));
        validate(original.get("kind").toString(),body);
        if("RECIPIENT".equals(original.get("kind")))provider.verifyFundAccount(binding.path("fundAccountId").asText(),binding.path("contactId").asText());
        return tx.execute(s->{
            var row=db.queryForMap("SELECT * FROM payment_schema.referral_finance_review WHERE id=? FOR UPDATE",id);
            if(!row.get("content_hash").equals(request.expectedHash()))throw conflict("Reviewed content hash changed");
            if(row.get("created_by").equals(actor.identityId()))throw conflict("A different operator must approve");
            if(row.get("approved_by")!=null)return Map.of("id",id,"status","APPROVED");
            Instant now=Instant.now();String kind=row.get("kind").toString();
            UUID aggregate=UUID.fromString(body.path(kind.equals("RECIPIENT")?"userId":"fundingId").asText());
            outbox.enqueue("review/"+id,kind.equals("RECIPIENT")?"recipient.assessed":"budget.funded",aggregate,now,body);
            db.update("UPDATE payment_schema.referral_finance_review SET approved_by=?,approved_at=? WHERE id=?",actor.identityId(),Timestamp.from(now),id);
            return Map.of("id",id,"status","APPROVED");
        });
    }
    public List<Map<String,Object>> list(CravesPrincipal actor,int limit) {
        FinancePolicyService.reader(actor);if(limit<1 || limit>100)throw bad("Limit must be 1..100");
        return db.queryForList("SELECT id,kind,payload,provider_binding,content_hash,evidence_ref,created_by,created_at,approved_by,approved_at FROM payment_schema.referral_finance_review ORDER BY created_at DESC,id DESC LIMIT ?",limit);
    }
    private Map<String,Object> load(UUID id) {var rows=db.queryForList("SELECT * FROM payment_schema.referral_finance_review WHERE id=?",id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Review not found");return rows.getFirst();}
    private JsonNode parse(Object value){try{return json.readTree(value.toString());}catch(Exception e){throw new IllegalStateException("Invalid stored review",e);}}
    static void validate(String kind,JsonNode p) {
        if(p==null || !p.isObject())throw bad("Review payload is required");
        if("FUNDING".equals(kind)) {
            fields(p,Set.of("fundingId","track","amountPaise","evidenceRef"));uuid(p,"fundingId");positive(p,"amountPaise");reference(p.path("evidenceRef").asText());
            if(!Set.of("CUSTOMER","DISCOUNT").contains(p.path("track").asText()))throw bad("Invalid funding track");
        } else if("RECIPIENT".equals(kind)) {
            fields(p,Set.of("assessmentId","userId","financialYear","kycVerified","kycExpiresAt","destinationRef","taxAssessmentRef","taxHandling","cashoutAllowed","annualLimitPaise","assessedAt","annualThresholdReviewRef"));
            uuid(p,"assessmentId");uuid(p,"userId");positive(p,"annualLimitPaise");
            if(!p.path("destinationRef").asText().matches("[A-Za-z0-9][A-Za-z0-9._:-]{5,179}"))throw bad("Opaque destination reference required");reference(p.path("taxAssessmentRef").asText());
            if(!p.path("kycVerified").isBoolean() || !p.path("kycVerified").asBoolean() || !p.path("cashoutAllowed").isBoolean() || !p.path("cashoutAllowed").asBoolean())throw bad("Approved cashout requires verified recipient evidence");
            Instant assessed,expires;try{assessed=Instant.parse(p.path("assessedAt").asText());expires=Instant.parse(p.path("kycExpiresAt").asText());}catch(Exception e){throw bad("Invalid assessment time");}
            Instant now=Instant.now();if(assessed.isAfter(now.plusSeconds(60)) || assessed.isBefore(now.minusSeconds(86400)) || !expires.isAfter(now))throw bad("Assessment must be current and unexpired");
            var day=assessed.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate();int year=day.getMonthValue()>=4?day.getYear():day.getYear()-1;
            if(!p.path("financialYear").asText().equals(year+"-"+(year+1)))throw bad("Incorrect financial year");
            if(!Set.of("REVIEWED_AT_REWARD_CREDIT","REVIEWED_AT_CASHOUT").contains(p.path("taxHandling").asText()))throw bad("Tax handling review is required");
            if(p.hasNonNull("annualThresholdReviewRef"))reference(p.path("annualThresholdReviewRef").asText());
        } else throw bad("Unknown review kind");
    }
    static long positive(JsonNode p,String name) {var v=p.path(name);if(!v.isTextual() || !v.asText().matches("[1-9][0-9]{0,12}"))throw bad("Exact positive paise required: "+name);return Long.parseLong(v.asText());}
    static UUID uuid(JsonNode p,String name){try{return UUID.fromString(p.path(name).asText());}catch(Exception e){throw bad("Invalid identity: "+name);}}
    static String reference(String value){if(value==null || !value.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{5,179}"))throw bad("An evidence reference is required");return value;}
    static void fields(JsonNode p,Set<String> allowed){p.fieldNames().forEachRemaining(n->{if(!allowed.contains(n))throw bad("Unknown field: "+n);});}
    static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    static ResponseStatusException conflict(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
