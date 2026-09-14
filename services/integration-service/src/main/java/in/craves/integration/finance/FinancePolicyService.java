package in.craves.integration.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.security.CravesPrincipal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class FinancePolicyService {
    public record View(long revision,UUID policyId,FinancePolicy settings,List<String> activationBlockers,
        String releaseStatus,int maximumManualRequestsPerIstDay) {}
    public record DraftRequest(FinancePolicy settings,String reason) {}
    public record Draft(UUID id,String contentHash,FinancePolicy settings) {}
    public record ActivateRequest(long expectedRevision,String expectedHash,String reason) {}
    private final JdbcTemplate jdbc;private final ObjectMapper json;
    private final boolean financialSourceReady;private final boolean postingEnabled;private final boolean payoutReady;private final boolean manualReady;
    public FinancePolicyService(JdbcTemplate jdbc,ObjectMapper json,boolean sourceReady,boolean postingEnabled,boolean payoutReady) {
        this(jdbc,json,sourceReady,postingEnabled,payoutReady,false);
    }
    @org.springframework.beans.factory.annotation.Autowired
    public FinancePolicyService(JdbcTemplate jdbc,ObjectMapper json,
        @Value("${craves.finance.authoritative-source-ready:false}") boolean sourceReady,
        @Value("${craves.ledger.posting-enabled:false}") boolean postingEnabled,
        @Value("${craves.razorpayx.production-approved:false}") boolean payoutReady,
        @Value("${CRAVES_MANUAL_SETTLEMENT_ENABLED:false}") boolean manualReady) {
        this.jdbc=jdbc;this.json=json;this.financialSourceReady=sourceReady;this.postingEnabled=postingEnabled;this.payoutReady=payoutReady;this.manualReady=manualReady;
    }
    public View view(CravesPrincipal actor) {reader(actor);return current();}
    public View current() {
        return jdbc.query("SELECT h.revision,h.policy_id,v.payload::text FROM payment_schema.finance_policy_head h LEFT JOIN payment_schema.finance_policy_version v ON v.id=h.policy_id WHERE h.singleton=true",
            (rs,n)->view(rs.getLong(1),rs.getObject(2,UUID.class),rs.getString(3)==null?FinancePolicy.launchDraft():decode(rs.getString(3)))).getFirst();
    }
    public List<String> blockers(FinancePolicy policy) {
        var result=new ArrayList<String>();
        if(!financialSourceReady) result.add("AUTHORITATIVE_ORDER_SNAPSHOT_AND_CAPTURE_WIRING_NOT_CERTIFIED");
        if(!postingEnabled) result.add("JOURNAL_POSTING_DISABLED");
        if(policy.taxApprovalReference()==null || policy.chefFeeTaxTreatment()==FinancePolicy.FeeTaxTreatment.UNCONFIRMED)
            result.add("COMMISSION_GST_TREATMENT_AND_TAX_CLASSIFICATION_UNCONFIRMED");
        if(policy.automaticPayoutsEnabled() && !payoutReady) result.add("RAZORPAYX_ACCOUNT_PAYOUT_PERMISSION_NOT_CERTIFIED");
        if(policy.manualWithdrawalsEnabled() && !payoutReady && !manualReady) result.add("MANUAL_SETTLEMENT_RUNTIME_NOT_CERTIFIED");
        return List.copyOf(result);
    }
    private View view(long revision,UUID id,FinancePolicy settings) {
        return new View(revision,id,settings,blockers(settings),settings.ledgerEnabled()?"CONFIGURATION_ENABLED_RUNTIME_EVIDENCE_REQUIRED":"NOT_ACTIVATED",1);
    }
    @Transactional
    public Draft draft(CravesPrincipal actor,DraftRequest request) {
        operator(actor);if(request==null || request.settings()==null) throw bad("Settings are required");
        String reason=reason(request.reason()),encoded=encode(request.settings()),hash=hash(encoded);UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO payment_schema.finance_policy_version(id,payload,content_hash,created_by,reason) VALUES (?,CAST(? AS jsonb),?,?,?)",
            id,encoded,hash,actor.identityId(),reason);
        return new Draft(id,hash,request.settings());
    }
    @Transactional
    public View activate(CravesPrincipal actor,UUID id,ActivateRequest request) {
        operator(actor);if(request==null) throw bad("Activation context is required");String reason=reason(request.reason());
        long revision=jdbc.queryForObject("SELECT revision FROM payment_schema.finance_policy_head WHERE singleton=true FOR UPDATE",Long.class);
        if(revision!=request.expectedRevision()) throw conflict("Policy changed; reload and preview again");
        var rows=jdbc.query("SELECT payload::text,content_hash FROM payment_schema.finance_policy_version WHERE id=?",
            (rs,n)->new Draft(id,rs.getString(2),decode(rs.getString(1))),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Policy not found");var candidate=rows.getFirst();
        if(!candidate.contentHash().equals(request.expectedHash())) throw conflict("Reviewed policy hash differs");
        var policy=candidate.settings();
        if(policy.ledgerEnabled() && (!financialSourceReady || !postingEnabled)) throw conflict("Authoritative earning source and journal release gates are not certified");
        if(policy.automaticPayoutsEnabled() && !payoutReady) throw conflict("RazorpayX automatic payout activation has not been certified");
        if(policy.manualWithdrawalsEnabled() && !payoutReady && !manualReady) throw conflict("Manual settlement runtime has not been certified");
        var previous=current().settings();
        if(previous.ledgerEnabled() && !previous.ledgerStartDate().equals(policy.ledgerStartDate())) throw conflict("An activated ledger start date cannot be moved through a policy edit");
        jdbc.update("UPDATE payment_schema.finance_policy_head SET policy_id=?,revision=revision+1,updated_at=now() WHERE singleton=true",id);
        jdbc.update("INSERT INTO payment_schema.finance_policy_activation(id,policy_id,revision,actor_id,reason) VALUES (?,?,?,?,?)",
            UUID.randomUUID(),id,revision+1,actor.identityId(),reason);
        return current();
    }
    public static void operator(CravesPrincipal actor) {
        if(actor==null || actor.identityId()==null || !actor.hasAnyRole("PLATFORM_ADMIN","PAYMENTS_ADMIN"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Payments administration role is required");
    }
    public static void reader(CravesPrincipal actor) {
        if(actor==null || actor.identityId()==null || !actor.hasAnyRole("PLATFORM_ADMIN","PAYMENTS_ADMIN","AUDIT_ADMIN"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Finance read role is required");
    }
    public static String reason(String value) {
        if(value==null || value.isBlank() || value.length()>1000) throw bad("A reason of 1 to 1000 characters is required");return value.trim();
    }
    private String encode(Object value) {try{return json.writeValueAsString(value);}catch(Exception e){throw bad("Invalid policy");}}
    private FinancePolicy decode(String value) {try{return json.readValue(value,FinancePolicy.class);}catch(Exception e){throw new IllegalStateException("Persisted finance policy is invalid",e);}}
    private static String hash(String value) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private static ResponseStatusException bad(String message) {return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    private static ResponseStatusException conflict(String message) {return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
