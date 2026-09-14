package in.craves.integration.payout.bank;

import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.security.CravesPrincipal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import static in.craves.integration.payout.bank.BankOnboardingModels.*;

@Service
public class BankOnboardingService {
    public record Controls(long revision, boolean submissionsEnabled, boolean validationEnabled,
                           int maximumRequestsPerDay, boolean encryptionReady, boolean providerReady,
                           boolean workerDeployed, List<AdminRow> recent) {}
    public record ControlChange(long expectedRevision, boolean submissionsEnabled, boolean validationEnabled,
                                int maximumRequestsPerDay, String reason) {}
    private final JdbcTemplate jdbc;
    private final BankDataCipher cipher;
    private final BankApplicantClient applicants;
    private final RazorpayBankValidationClient provider;
    private final TransactionTemplate tx;
    private final boolean workerDeployed;
    public BankOnboardingService(JdbcTemplate jdbc, BankDataCipher cipher, BankApplicantClient applicants,
            RazorpayBankValidationClient provider, PlatformTransactionManager manager,
            @Value("${CRAVES_BANK_WORKER_ENABLED:false}") boolean workerDeployed) {
        this.jdbc=jdbc; this.cipher=cipher; this.applicants=applicants; this.provider=provider;
        this.tx=new TransactionTemplate(manager); this.workerDeployed=workerDeployed;
    }
    public Status status(CravesPrincipal actor) {
        requireIdentity(actor);
        var rows=jdbc.query("SELECT r.* FROM payment_schema.finance_bank_head h JOIN payment_schema.finance_bank_request r ON r.id=h.request_id WHERE h.chef_identity_id=?",
                this::mapStatus,actor.identityId());
        return rows.isEmpty()?new Status(null,"NOT_SUBMITTED",null,null,false,false,true,
                "Add your bank details once. Razorpay performs bank validation automatically.",null):rows.getFirst();
    }
    public Status submit(CravesPrincipal actor, Submission request) {
        requireIdentity(actor);
        if(!cipher.ready()) throw unavailable("Secure bank storage is not configured");
        var identity=applicants.fetch(actor.identityId());
        var details=BankOnboardingModels.details(request,identity);
        return tx.execute(s->save(actor.identityId(),request,details));
    }
    private Status save(UUID chef,Submission request,Details details) {
        lockChef(chef);
        var receipt=jdbc.queryForList("SELECT request_id,expected_current_id FROM payment_schema.finance_bank_submission_receipt WHERE chef_identity_id=? AND request_key=?",chef,request.requestKey());
        if(!receipt.isEmpty()) {
            var r=receipt.getFirst();UUID id=(UUID)r.get("request_id");
            var original=jdbc.queryForObject("SELECT encrypted_details FROM payment_schema.finance_bank_request WHERE id=?",String.class,id);
            if(!Objects.equals(request.expectedCurrentId(),r.get("expected_current_id")) || !cipher.same(details,cipher.decrypt(id,chef,original)))
                throw conflict("Request key was reused with changed bank details");
            return get(id);
        }
        var controls=jdbc.queryForMap("SELECT * FROM payment_schema.finance_bank_automation_control WHERE singleton=true FOR SHARE");
        if(!Boolean.TRUE.equals(controls.get("submissions_enabled"))) throw unavailable("Bank enrollment is not enabled");
        var heads=jdbc.query("SELECT request_id FROM payment_schema.finance_bank_head WHERE chef_identity_id=? FOR UPDATE",(rs,n)->rs.getObject(1,UUID.class),chef);
        UUID current=heads.isEmpty()?null:heads.getFirst();
        if(!Objects.equals(current,request.expectedCurrentId())) throw conflict("Bank profile changed; refresh before editing");
        if(current!=null) {
            var previous=jdbc.queryForMap("SELECT encrypted_details,state FROM payment_schema.finance_bank_request WHERE id=?",current);
            boolean mayResubmit=Set.of("VALIDATION_FAILED","NAME_MISMATCH","APPLICANT_ACTION_REQUIRED").contains(previous.get("state").toString());
            if(!mayResubmit && cipher.same(details,cipher.decrypt(current,chef,previous.get("encrypted_details").toString()))) {
                receive(chef,request,current);return get(current);
            }
        }
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.finance_payout_instruction WHERE chef_identity_id=? AND status IN ('RESERVED','SUBMITTING','PROCESSING','UNKNOWN','REVIEW_REQUIRED'))",Boolean.class,chef)))
            throw conflict("An existing payout is reserved or unresolved; bank changes cannot redirect it");
        int count=jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_bank_request WHERE chef_identity_id=? AND created_at>now()-interval '24 hours'",Integer.class,chef);
        if(count>=((Number)controls.get("maximum_requests_per_day")).intValue())
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Bank enrollment limit reached for the last 24 hours");
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO payment_schema.finance_bank_request(id,chef_identity_id,encrypted_details,fingerprint,last_four,ifsc,consent_version,state) VALUES (?,?,?,?,?,?,?,'QUEUED')",
                id,chef,cipher.encrypt(id,chef,details),cipher.fingerprint(details),
                details.accountNumber().substring(details.accountNumber().length()-4),details.ifsc(),CONSENT_VERSION);
        if(current!=null) jdbc.update("UPDATE payment_schema.finance_bank_request SET state='SUPERSEDED',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=?",current);
        jdbc.update("INSERT INTO payment_schema.finance_bank_head(chef_identity_id,request_id) VALUES (?,?) ON CONFLICT(chef_identity_id) DO UPDATE SET request_id=EXCLUDED.request_id",chef,id);
        jdbc.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_reason) VALUES (?,false,NULL) ON CONFLICT DO NOTHING",chef);
        receive(chef,request,id);audit(id,chef,"ENROLLMENT_QUEUED","CHEF");return get(id);
    }
    private void receive(UUID chef,Submission request,UUID id) {
        jdbc.update("INSERT INTO payment_schema.finance_bank_submission_receipt(chef_identity_id,request_key,request_id,expected_current_id) VALUES (?,?,?,?)",chef,request.requestKey(),id,request.expectedCurrentId());
    }
    public Controls controls(CravesPrincipal actor) {
        FinancePolicyService.reader(actor);
        var c=jdbc.queryForMap("SELECT * FROM payment_schema.finance_bank_automation_control WHERE singleton=true");
        var rows=jdbc.query("SELECT r.* FROM payment_schema.finance_bank_head h JOIN payment_schema.finance_bank_request r ON r.id=h.request_id ORDER BY r.updated_at DESC,r.id DESC LIMIT 100",
                (rs,n)->new AdminRow(rs.getObject("chef_identity_id",UUID.class),mapStatus(rs,n)));
        return new Controls(((Number)c.get("revision")).longValue(),(boolean)c.get("submissions_enabled"),
                (boolean)c.get("validation_enabled"),((Number)c.get("maximum_requests_per_day")).intValue(),
                cipher.ready(),provider.ready(),workerDeployed,rows);
    }
    public Controls configure(CravesPrincipal actor,ControlChange change) {
        FinancePolicyService.operator(actor);
        if(change==null || change.maximumRequestsPerDay()<1 || change.maximumRequestsPerDay()>10)
            throw new IllegalArgumentException("Bank enrollment limit must be between 1 and 10");
        String reason=FinancePolicyService.reason(change.reason());
        if(change.submissionsEnabled() && !cipher.ready()) throw conflict("Encrypted bank storage is not ready");
        if(change.validationEnabled() && (!provider.ready() || !workerDeployed))
            throw conflict("Provider entitlement/credentials and validation worker must be configured before enabling live validation");
        tx.execute(s->{
            long revision=jdbc.queryForObject("SELECT revision FROM payment_schema.finance_bank_automation_control WHERE singleton=true FOR UPDATE",Long.class);
            if(revision!=change.expectedRevision()) throw conflict("Automation settings changed; reload");
            jdbc.update("UPDATE payment_schema.finance_bank_automation_control SET revision=revision+1,submissions_enabled=?,validation_enabled=?,maximum_requests_per_day=?,updated_by=?,reason=?,updated_at=now() WHERE singleton=true",
                    change.submissionsEnabled(),change.validationEnabled(),change.maximumRequestsPerDay(),actor.identityId(),reason);
            jdbc.update("INSERT INTO payment_schema.finance_bank_control_audit(id,revision,submissions_enabled,validation_enabled,maximum_requests_per_day,actor_id,reason) VALUES (?,?,?,?,?,?,?)",
                    UUID.randomUUID(),revision+1,change.submissionsEnabled(),change.validationEnabled(),change.maximumRequestsPerDay(),actor.identityId(),reason);
            return null;
        });return controls(actor);
    }
    /** One bounded unit of work. All network calls are outside local database transactions. */
    public boolean processOne() {
        if(!provider.ready() || !cipher.ready()) return false;
        Work work=tx.execute(s->claim());if(work==null) return false;
        try {
            Details d=cipher.decrypt(work.id(),work.chefId(),work.encryptedDetails());
            Identity identity=applicants.fetch(work.chefId());
            if(!Set.of("PENDING","APPROVED").contains(identity.status())
                    || !d.applicationId().equals(identity.applicationId())
                    || !normalizeName(d.name()).equals(normalizeName(identity.name()))
                    || !d.email().equals(identity.email()) || identity.phone()==null
                    || !d.phone().equals(identity.phone().replaceFirst("^\\+91",""))) {
                tx.execute(s->{invalidApplicant(work);return null;});return true;
            }
            Result result;
            if(work.validationId()!=null) result=provider.fetch(work.id(),d,work.validationId());
            else if("QUEUED".equals(work.state())) {
                // Journal intent only immediately before the chargeable POST. A failed identity read is safely retryable.
                if(!Boolean.TRUE.equals(tx.execute(s->beginSubmission(work)))) return true;
                result=provider.create(work.id(),d);
            } else result=provider.find(work.id(),d,work.createdAt());
            if(result==null) {tx.execute(s->{uncertain(work);return null;});return true;}
            tx.execute(s->{apply(work,result,identity.approved());return null;});
        } catch(RuntimeException error) {tx.execute(s->{uncertain(work);return null;});}
        return true;
    }
    private Work claim() {
        boolean enabled=Boolean.TRUE.equals(jdbc.queryForObject("SELECT validation_enabled FROM payment_schema.finance_bank_automation_control WHERE singleton=true",Boolean.class));
        if(!enabled) return null;
        jdbc.update("UPDATE payment_schema.finance_bank_request SET state='UNKNOWN',lease_id=NULL,lease_until=NULL,last_error='INTERRUPTED_SUBMISSION',updated_at=now() WHERE state='SUBMITTING' AND lease_until<now()");
        var rows=jdbc.queryForList("SELECT r.* FROM payment_schema.finance_bank_request r JOIN payment_schema.finance_bank_head h ON h.request_id=r.id WHERE r.state IN ('QUEUED','VALIDATING','UNKNOWN','WAITING_APPROVAL','VERIFIED') AND r.next_attempt_at<=now() AND (r.lease_until IS NULL OR r.lease_until<now()) ORDER BY r.next_attempt_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED");
        if(rows.isEmpty()) return null;
        var row=rows.getFirst();UUID id=(UUID)row.get("id"),lease=UUID.randomUUID();String old=row.get("state").toString();
        jdbc.update("UPDATE payment_schema.finance_bank_request SET lease_id=?,lease_until=now()+interval '300 seconds',attempts=attempts+1,updated_at=now() WHERE id=?",lease,id);
        return new Work(id,(UUID)row.get("chef_identity_id"),lease,old,(String)row.get("validation_id"),
                row.get("encrypted_details").toString(),((Timestamp)row.get("created_at")).toInstant());
    }
    private boolean beginSubmission(Work work) {
        var row=ownedWork(work);if(row==null || !"QUEUED".equals(row.get("state"))) return false;
        if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT validation_enabled FROM payment_schema.finance_bank_automation_control WHERE singleton=true FOR SHARE",Boolean.class))) {
            jdbc.update("UPDATE payment_schema.finance_bank_request SET lease_id=NULL,lease_until=NULL WHERE id=?",work.id());return false;
        }
        jdbc.update("UPDATE payment_schema.finance_bank_request SET state='SUBMITTING',updated_at=now() WHERE id=?",work.id());
        return true;
    }
    private Map<String,Object> ownedWork(Work work) {
        lockChef(work.chefId());
        var rows=jdbc.queryForList("SELECT r.* FROM payment_schema.finance_bank_request r JOIN payment_schema.finance_bank_head h ON h.request_id=r.id WHERE r.id=? AND r.lease_id=? FOR UPDATE OF r",work.id(),work.leaseId());
        return rows.isEmpty()?null:rows.getFirst();
    }
    private void apply(Work work,Result result,boolean approved) {
        var row=ownedWork(work);if(row==null) return;
        if(row.get("validation_id")!=null && !row.get("validation_id").equals(result.validationId())) throw conflict("Original validation identity differs");
        jdbc.update("INSERT INTO payment_schema.finance_bank_evidence(id,request_id,validation_id,fund_account_id,contact_id,result,payload_hash) VALUES (?,?,?,?,?,?,?)",
                UUID.randomUUID(),work.id(),result.validationId(),result.fundAccountId(),result.contactId(),result.state(),result.evidenceHash());
        boolean valid="BANK_VALIDATED".equals(result.state());
        String state=valid?(approved?"VERIFIED":"WAITING_APPROVAL"):result.state();
        UUID beneficiary=(UUID)row.get("beneficiary_id");
        if(valid && approved && beneficiary==null) {
            beneficiary=UUID.randomUUID();
            jdbc.update("INSERT INTO payment_schema.finance_beneficiary_version(id,chef_identity_id,fund_account_id,contact_id,verification_reference,verified_by,verification_actor_type) VALUES (?,?,?,?,?,NULL,'RAZORPAY_VALIDATION')",
                    beneficiary,work.chefId(),result.fundAccountId(),result.contactId(),"razorpayx/"+result.validationId());
        }
        int delay="VERIFIED".equals(state)?21600:("WAITING_APPROVAL".equals(state)?300:60);
        jdbc.update("UPDATE payment_schema.finance_bank_request SET state=?,validation_id=?,fund_account_id=?,contact_id=?,beneficiary_id=?,bank_validated=?,application_approved=?,verified_at=CASE WHEN ? THEN now() ELSE verified_at END,lease_id=NULL,lease_until=NULL,last_error=NULL,next_attempt_at=now()+(? * interval '1 second'),updated_at=now() WHERE id=?",
                state,result.validationId(),result.fundAccountId(),result.contactId(),beneficiary,valid,approved,valid && approved,delay,work.id());
        if(valid && approved) {
            // Only the initial system-generated missing-beneficiary hold can be cleared. Financial holds remain intact.
            jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=CASE WHEN beneficiary_id IS NULL AND hold_reason='Beneficiary verification required' THEN false ELSE on_hold END,hold_reason=CASE WHEN beneficiary_id IS NULL AND hold_reason='Beneficiary verification required' THEN NULL ELSE hold_reason END,beneficiary_id=?,updated_at=now() WHERE chef_identity_id=?",beneficiary,work.chefId());
        }
        audit(work.id(),work.chefId(),state,"RAZORPAY_VALIDATION");
    }
    private void uncertain(Work work) {
        var row=ownedWork(work);if(row==null)return;
        int attempts=((Number)row.get("attempts")).intValue();
        int delay=Math.min(3600,30*(1<<Math.min(6,attempts)))+ThreadLocalRandom.current().nextInt(30);
        jdbc.update("UPDATE payment_schema.finance_bank_request SET state=CASE WHEN state='SUBMITTING' THEN 'UNKNOWN' ELSE state END,lease_id=NULL,lease_until=NULL,last_error='PROVIDER_OR_SOURCE_UNCONFIRMED',next_attempt_at=now()+(? * interval '1 second'),updated_at=now() WHERE id=?",delay,work.id());
        audit(work.id(),work.chefId(),"RECONCILIATION_SCHEDULED","SERVICE");
    }
    private void invalidApplicant(Work work) {
        if(ownedWork(work)==null)return;
        jdbc.update("UPDATE payment_schema.finance_bank_request SET state='APPLICANT_ACTION_REQUIRED',application_approved=false,lease_id=NULL,lease_until=NULL,last_error='APPLICANT_IDENTITY_CHANGED_OR_INELIGIBLE',updated_at=now() WHERE id=?",work.id());
        audit(work.id(),work.chefId(),"APPLICANT_ACTION_REQUIRED","SERVICE");
    }
    private Status get(UUID id) {return jdbc.query("SELECT * FROM payment_schema.finance_bank_request WHERE id=?",this::mapStatus,id).getFirst();}
    private Status mapStatus(ResultSet rs,int n)throws SQLException {
        String state=rs.getString("state");Timestamp verified=rs.getTimestamp("verified_at");
        boolean stale="VERIFIED".equals(state) && (verified==null || !verified.toInstant().isAfter(Instant.now().minusSeconds(86400)));
        String message=switch(state) {
            case "VERIFIED" -> stale?"Bank status recheck is pending. New payouts are paused until automatic verification is refreshed."
                :"Razorpay bank validation passed. No manual bank approval is required; other payout controls still apply.";
            case "WAITING_APPROVAL" -> "Bank validated by Razorpay. Chef application approval is still pending; this is not a bank review.";
            case "VALIDATION_FAILED" -> "Razorpay could not validate this bank account. Correct your bank details.";
            case "NAME_MISMATCH" -> "The bank-returned name does not match your saved chef applicant name. Correct your own account or application details.";
            case "UNKNOWN" -> "Razorpay response is unconfirmed. Automatic reconciliation is running; no duplicate validation request is sent.";
            case "APPLICANT_ACTION_REQUIRED" -> "Your saved chef identity or application status changed. Update and resubmit your bank enrollment.";
            case "SUPERSEDED" -> "This is an older bank enrollment and cannot receive new payouts.";
            default -> "Bank details saved securely. Automatic Razorpay validation is pending.";
        };
        return new Status(rs.getObject("id",UUID.class),stale?"VALIDATING":state,rs.getString("last_four"),rs.getString("ifsc"),
                rs.getBoolean("bank_validated"),rs.getBoolean("application_approved"),true,message,
                rs.getTimestamp("updated_at").toInstant());
    }
    private void audit(UUID id,UUID chef,String action,String actor) {
        jdbc.update("INSERT INTO payment_schema.finance_bank_audit(id,request_id,chef_identity_id,action,actor_type) VALUES (?,?,?,?,?)",UUID.randomUUID(),id,chef,action,actor);
    }
    private void lockChef(UUID chef) {jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},"chef-payout/"+chef);}
    private static void requireIdentity(CravesPrincipal actor) {
        if(actor==null || actor.identityId()==null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Sign in before bank enrollment");
    }
    private static ResponseStatusException conflict(String message) {return new ResponseStatusException(HttpStatus.CONFLICT,message);}
    private static ResponseStatusException unavailable(String message) {return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,message);}
}
