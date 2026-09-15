package in.craves.integration.payout;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ChefPayoutService {
    public record Payout(UUID id,String amount,String mode,String status,String providerStatus,String transferReference,Instant createdAt,String payoutChannel) {}
    public record Balance(String available,String outstanding,String reservedOrPaid,boolean onHold,
        boolean manualRequestUsedToday,String nextManualRequestAt,List<Payout> recentPayouts,boolean executionEnabled,String payoutMode) {}
    public record Withdrawal(UUID requestKey,String expectedAvailableAmount) {}
    public record Binding(String fundAccountId,String contactId,String bankOwnershipEvidence,String reason) {}
    public record Hold(boolean onHold,String reason) {}
    public record Work(UUID id,UUID leaseId,UUID chef,String fundAccountId,String amount,String providerId,String mode) {
        RazorpayXPayoutClient.Instruction instruction() {return new RazorpayXPayoutClient.Instruction(id,fundAccountId,amount,providerId);}
    }
    private final JdbcTemplate jdbc;private final ObjectMapper json;private final FinancePolicyService policies;
    private final LedgerPostingService ledger;private final RazorpayXPayoutClient provider;
    private final ManualChefSettlementService manual;
    public ChefPayoutService(JdbcTemplate jdbc,ObjectMapper json,FinancePolicyService policies,LedgerPostingService ledger,RazorpayXPayoutClient provider) {
        this(jdbc,json,policies,ledger,provider,null);
    }
    @org.springframework.beans.factory.annotation.Autowired
    public ChefPayoutService(JdbcTemplate jdbc,ObjectMapper json,FinancePolicyService policies,LedgerPostingService ledger,RazorpayXPayoutClient provider,ManualChefSettlementService manual) {
        this.jdbc=jdbc;this.json=json;this.policies=policies;this.ledger=ledger;this.provider=provider;this.manual=manual;
    }
    /** Internal finalizer hook only. Never expose this as an admin-entered amount endpoint. */
    @Transactional
    public void recordDeliveredPayable(UUID chef,UUID order,UUID journal,Instant deliveredAt,FinancePolicy frozenPolicy) {
        lockChef(chef);
        if(!frozenPolicy.ledgerEnabled() || deliveredAt==null) throw conflict("Verified enabled financial snapshot is required");
        deliveredAt=deliveredAt.truncatedTo(ChronoUnit.MICROS);
        var source=jdbc.query("SELECT coalesce(sum(l.credit_amount-l.debit_amount),0) FROM payment_schema.ledger_transaction t JOIN payment_schema.ledger_line l ON l.transaction_id=t.id WHERE t.id=? AND t.chef_order_id=? AND t.event_type='CHEF_ORDER_EARNING' AND l.account_code='CHEF_PAYABLE' AND l.chef_identity_id=? GROUP BY t.id",
            (rs,n)->rs.getBigDecimal(1),journal,order,chef);
        if(source.size()!=1 || source.getFirst().signum()<=0) throw conflict("Verified earning journal does not establish this chef payable");
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.chef_earning_entry WHERE order_id=? AND status IN ('SETTLEMENT_PENDING','SETTLED','REVERSED'))",Boolean.class,order)))
            throw conflict("Legacy settlement or reversal already owns this order");
        jdbc.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,hold_reason,hold_kind) VALUES (?,'Beneficiary verification required','BANK_REQUIREMENT') ON CONFLICT DO NOTHING",chef);
        jdbc.update("INSERT INTO payment_schema.finance_payable(id,chef_identity_id,chef_order_id,journal_id,amount,delivered_at,automatic_due_at,manual_available_at,policy_snapshot) VALUES (?,?,?,?,?,?,?,?,CAST(? AS jsonb)) ON CONFLICT(chef_order_id) DO NOTHING",
            UUID.randomUUID(),chef,order,journal,source.getFirst(),Timestamp.from(deliveredAt),Timestamp.from(frozenPolicy.automaticDueAt(deliveredAt)),Timestamp.from(frozenPolicy.manualAvailableAt(deliveredAt)),encode(frozenPolicy));
        var existing=jdbc.queryForMap("SELECT chef_identity_id,journal_id,delivered_at,policy_snapshot::text AS policy FROM payment_schema.finance_payable WHERE chef_order_id=?",order);
        if(!chef.equals(existing.get("chef_identity_id")) || !journal.equals(existing.get("journal_id")) || !Timestamp.from(deliveredAt).equals(existing.get("delivered_at"))
            || !decode(existing.get("policy").toString()).equals(frozenPolicy)) throw conflict("Payable replay context differs");
    }
    public Balance balance(CravesPrincipal actor) {
        chef(actor);UUID id=actor.identityId();Instant now=Instant.now();LocalDate date=now.atZone(FinancePolicy.ZONE).toLocalDate();
        boolean manualMode=manual!=null && manual.configured();
        boolean held=manualMode?manual.held(id):isHeld(id),used=usedDay(id,date);
        BigDecimal available=sumAvailable(id,now,false);BigDecimal total=jdbc.queryForObject("SELECT coalesce(sum(amount),0) FROM payment_schema.finance_payable WHERE chef_identity_id=?",BigDecimal.class,id);
        BigDecimal allocated=jdbc.queryForObject("SELECT coalesce(sum(p.amount),0) FROM payment_schema.finance_payable p JOIN payment_schema.finance_payout_allocation a ON a.payable_id=p.id WHERE p.chef_identity_id=? AND a.active",BigDecimal.class,id);
        return new Balance(LedgerMoney.text(held?BigDecimal.ZERO:available),LedgerMoney.text(total.subtract(paidTotal(id))),LedgerMoney.text(allocated),held,used,
            date.plusDays(1).atStartOfDay(FinancePolicy.ZONE).toInstant().toString(),listForChef(id),!held && (manualMode?manual.enabled():policies.current().settings().manualWithdrawalsEnabled() && provider.ready()),manualMode?"CRAVES_MANUAL":"RAZORPAYX");
    }
    private BigDecimal paidTotal(UUID chef) {return jdbc.queryForObject("SELECT coalesce(sum(amount),0) FROM payment_schema.finance_payout_instruction WHERE chef_identity_id=? AND settlement_journal_id IS NOT NULL AND reversal_journal_id IS NULL",BigDecimal.class,chef);}
    private List<Payout> listForChef(UUID chef) {return jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction WHERE chef_identity_id=? ORDER BY created_at DESC,id DESC LIMIT 100",this::map,chef);}
    public List<Payout> listAdmin(CravesPrincipal actor) {FinancePolicyService.reader(actor);return jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction ORDER BY created_at DESC,id DESC LIMIT 100",this::map);}
    @Transactional
    public Payout withdraw(CravesPrincipal actor,Withdrawal request) {
        chef(actor);
        if(manual!=null && manual.configured()) {var reserved=manual.reserveChef(actor,request);return get(reserved.id());}
        if(request==null || request.requestKey()==null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"A stable request UUID is required");
        BigDecimal expected=LedgerMoney.parse(request.expectedAvailableAmount());lockChef(actor.identityId());
        var replay=jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction WHERE chef_identity_id=? AND request_key=?",this::map,actor.identityId(),request.requestKey());
        if(!replay.isEmpty()) {
            var p=replay.getFirst();if(!"MANUAL".equals(p.mode()) || expected.compareTo(LedgerMoney.parse(p.amount()))!=0) throw conflict("Withdrawal request key was reused with changed content");return p;
        }
        var policy=policies.current();if(!policy.settings().manualWithdrawalsEnabled() || !provider.ready()) throw conflict("Manual withdrawals are not enabled and certified");
        Instant now=Instant.now();LocalDate date=now.atZone(FinancePolicy.ZONE).toLocalDate();
        if(usedDay(actor.identityId(),date)) throw conflict("One accepted manual withdrawal is allowed per Asia/Kolkata calendar day");
        var result=reserve(actor.identityId(),request.requestKey(),"MANUAL",expected,now,policy.revision());
        jdbc.update("INSERT INTO payment_schema.finance_manual_withdrawal_day(chef_identity_id,business_date,instruction_id) VALUES (?,?,?)",actor.identityId(),java.sql.Date.valueOf(date),result.id());
        return result;
    }
    public List<UUID> dueChefs() {
        if(!policies.current().settings().automaticPayoutsEnabled() || !provider.ready()) return List.of();
        return jdbc.query("SELECT DISTINCT p.chef_identity_id FROM payment_schema.finance_payable p JOIN payment_schema.finance_chef_payout_control c ON c.chef_identity_id=p.chef_identity_id WHERE p.automatic_due_at<=now() AND NOT c.on_hold AND c.beneficiary_id IS NOT NULL AND payment_schema.finance_bank_ready(c.chef_identity_id,c.beneficiary_id) AND NOT EXISTS(SELECT 1 FROM payment_schema.finance_payout_allocation a WHERE a.payable_id=p.id AND a.active) ORDER BY p.chef_identity_id LIMIT 25",(rs,n)->rs.getObject(1,UUID.class));
    }
    @Transactional
    public void reserveAutomatic(UUID chef) {
        lockChef(chef);var policy=policies.current();if(!policy.settings().automaticPayoutsEnabled() || !provider.ready() || isHeld(chef)) return;
        if(sumAvailable(chef,Instant.now(),true).signum()>0) reserve(chef,UUID.randomUUID(),"AUTOMATIC",null,Instant.now(),policy.revision());
    }
    private Payout reserve(UUID chef,UUID key,String mode,BigDecimal expected,Instant now,long revision) {
        var control=jdbc.query("SELECT beneficiary_id,on_hold OR NOT payment_schema.finance_bank_ready(chef_identity_id,beneficiary_id) FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=? FOR UPDATE",(rs,n)->new Object[]{rs.getObject(1,UUID.class),rs.getBoolean(2)},chef);
        if(control.isEmpty() || control.getFirst()[0]==null || Boolean.TRUE.equals(control.getFirst()[1])) throw conflict("Verified beneficiary required; chef balance is held");
        String time="AUTOMATIC".equals(mode)?"automatic_due_at":"manual_available_at";
        var payables=jdbc.query("SELECT p.id,p.amount FROM payment_schema.finance_payable p WHERE chef_identity_id=? AND "+time+"<=? AND NOT EXISTS(SELECT 1 FROM payment_schema.finance_payout_allocation a WHERE a.payable_id=p.id AND a.active) ORDER BY p.id FOR UPDATE",
            (rs,n)->new Payable(rs.getObject(1,UUID.class),rs.getBigDecimal(2)),chef,Timestamp.from(now));
        BigDecimal amount=payables.stream().map(Payable::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
        if(amount.signum()<=0 || (expected!=null && amount.compareTo(expected)!=0)) throw conflict("Available balance changed or is empty; refresh before requesting");
        LedgerMoney.amount(amount);UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO payment_schema.finance_payout_instruction(id,chef_identity_id,beneficiary_id,request_key,mode,amount,status,policy_revision) VALUES (?,?,?,?,?,?,'RESERVED',?)",id,chef,control.getFirst()[0],key,mode,amount,revision);
        for(var item:payables) jdbc.update("INSERT INTO payment_schema.finance_payout_allocation(instruction_id,payable_id) VALUES (?,?)",id,item.id());
        audit(id,chef,"RESERVED",mode,"policy-revision/"+revision);return get(id);
    }
    /** Compatibility for pre-automation beneficiaries only, not an override for bank validation. */
    @Transactional
    public void bindVerifiedBeneficiary(CravesPrincipal actor,UUID chef,Binding request) {
        FinancePolicyService.operator(actor);FinancePolicyService.reason(request.reason());String evidence=FinancePolicyService.reason(request.bankOwnershipEvidence());
        if(evidence.length()>240 || request.fundAccountId()==null || !request.fundAccountId().matches("fa_[A-Za-z0-9]+") || request.contactId()==null || !request.contactId().matches("cont_[A-Za-z0-9]+")) throw new IllegalArgumentException("Valid beneficiary identifiers and evidence are required");
        lockChef(chef);
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.finance_bank_head WHERE chef_identity_id=?)",Boolean.class,chef)))
            throw conflict("This chef uses automatic bank validation; manual beneficiary replacement is not permitted");
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO payment_schema.finance_beneficiary_version(id,chef_identity_id,fund_account_id,contact_id,verification_reference,verified_by) VALUES (?,?,?,?,?,?)",id,chef,request.fundAccountId(),request.contactId(),evidence,actor.identityId());
        jdbc.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,beneficiary_id,on_hold,hold_reason) VALUES (?,?,true,'New beneficiary: review and release hold') ON CONFLICT(chef_identity_id) DO UPDATE SET beneficiary_id=EXCLUDED.beneficiary_id,on_hold=true,hold_reason=EXCLUDED.hold_reason,updated_at=now()",chef,id);
        audit(null,chef,"BENEFICIARY_VERSION_BOUND",actor.identityId().toString(),evidence);
    }
    @Transactional
    public void hold(CravesPrincipal actor,UUID chef,Hold request) {
        FinancePolicyService.operator(actor);String reason=FinancePolicyService.reason(request.reason());lockChef(chef);
        if(jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=?,hold_reason=?,hold_kind='OPERATIONAL',updated_at=now() WHERE chef_identity_id=?",request.onHold(),reason,chef)!=1) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Chef payout settings not found");
        audit(null,chef,request.onHold()?"HOLD":"RELEASE_HOLD",actor.identityId().toString(),reason);
    }
    @Transactional
    public Work claim() {
        if(!provider.ready()) return null;var policy=policies.current().settings();
        var rows=jdbc.query("SELECT i.id FROM payment_schema.finance_payout_instruction i JOIN payment_schema.finance_chef_payout_control c ON c.chef_identity_id=i.chef_identity_id WHERE i.payout_channel='RAZORPAYX' AND ((i.status='RESERVED' AND NOT c.on_hold AND payment_schema.finance_bank_ready(c.chef_identity_id,i.beneficiary_id) AND ((i.mode='MANUAL' AND ?) OR (i.mode='AUTOMATIC' AND ?))) OR (i.provider_id IS NOT NULL AND i.status IN ('PROCESSING','UNKNOWN','SUBMITTING'))) AND i.next_attempt_at<=now() AND (i.lease_until IS NULL OR i.lease_until<now()) ORDER BY i.next_attempt_at,i.id LIMIT 1 FOR UPDATE OF i SKIP LOCKED",
            (rs,n)->rs.getObject(1,UUID.class),policy.manualWithdrawalsEnabled(),policy.automaticPayoutsEnabled());
        if(rows.isEmpty()) return null;UUID id=rows.getFirst(),lease=UUID.randomUUID();
        jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status=CASE WHEN status='RESERVED' THEN 'SUBMITTING' ELSE status END,lease_id=?,lease_until=now()+interval '60 seconds',attempts=attempts+1,updated_at=now() WHERE id=?",lease,id);
        return jdbc.query("SELECT i.*,b.fund_account_id FROM payment_schema.finance_payout_instruction i JOIN payment_schema.finance_beneficiary_version b ON b.id=i.beneficiary_id WHERE i.id=?",
            (rs,n)->new Work(id,lease,rs.getObject("chef_identity_id",UUID.class),rs.getString("fund_account_id"),LedgerMoney.text(rs.getBigDecimal("amount")),rs.getString("provider_id"),rs.getString("mode")),id).getFirst();
    }
    @Transactional
    public void recordOutcome(Work work,RazorpayXPayoutClient.Receipt receipt) {
        lockChef(work.chef());var state=jdbc.queryForMap("SELECT * FROM payment_schema.finance_payout_instruction WHERE id=? FOR UPDATE",work.id());
        if(!work.leaseId().equals(state.get("lease_id"))) return;
        if(!"RAZORPAYX".equals(state.get("payout_channel"))) throw conflict("Manual Craves settlement cannot accept provider outcomes");
        String previous=state.get("status").toString();if(Set.of("PAID","FAILED","REVERSED","REVIEW_REQUIRED").contains(previous)) return;
        String target=switch(receipt.status()) {case "processed"->"PAID";case "failed","cancelled","rejected"->"FAILED";case "reversed"->"REVERSED";default->"PROCESSING";};
        UUID journal=null;
        if("PAID".equals(target)) {
            var amount=LedgerMoney.parse(work.amount());
            var lines=List.of(new LedgerJournal.Line("CHEF_PAYABLE","INR",amount.toPlainString(),"0.00",work.chef(),null,null,null,null,work.id()),
                new LedgerJournal.Line("PAYOUT_CLEARING","INR","0.00",amount.toPlainString(),work.chef(),null,null,null,null,work.id()));
            var posted=ledger.post(new LedgerJournal.Entry("chef-payout/"+work.id()+"/confirmed",work.id(),"razorpayx","CHEF_PAYOUT_CONFIRMED",null,null,"INR",Instant.now(),"razorpayx/"+receipt.payoutId(),null,"SERVICE","chef-payout-worker",lines));
            if(posted.outcome()==LedgerJournal.Outcome.CONFLICT) {
                jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='REVIEW_REQUIRED',last_error='PAYOUT_POSTING_CONFLICT',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=?",work.id());
                jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,hold_reason='Payout posting conflict',updated_at=now() WHERE chef_identity_id=?",work.chef());return;
            }
            journal=posted.transactionId();
        }
        jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status=?,provider_id=?,provider_status=?,transfer_reference=?,settlement_journal_id=coalesce(?,settlement_journal_id),lease_id=NULL,lease_until=NULL,next_attempt_at=now()+interval '60 seconds',last_error=NULL,updated_at=now() WHERE id=?",
            target,receipt.payoutId(),receipt.status(),receipt.transferReference(),journal,work.id());
        if(Set.of("FAILED","REVERSED").contains(target)) {
            jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,hold_reason='Definitive provider failure/reversal: verify funding and beneficiary before retry',updated_at=now() WHERE chef_identity_id=?",work.chef());
            jdbc.update("UPDATE payment_schema.finance_payout_allocation SET active=false WHERE instruction_id=? AND active",work.id());
        }
        audit(work.id(),work.chef(),target,"chef-payout-worker","razorpayx/"+receipt.payoutId());
    }
    @Transactional
    public void uncertain(Work work) {
        jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status=CASE WHEN provider_id IS NULL THEN 'REVIEW_REQUIRED' ELSE 'UNKNOWN' END,last_error='PROVIDER_OUTCOME_UNCONFIRMED',lease_id=NULL,lease_until=NULL,next_attempt_at=now()+interval '120 seconds',updated_at=now() WHERE id=? AND lease_id=?",work.id(),work.leaseId());
    }
    @Transactional
    public void recoverStaleSubmissions() {
        jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='REVIEW_REQUIRED',last_error='CRASH_DURING_SUBMISSION',lease_id=NULL,lease_until=NULL,updated_at=now() WHERE payout_channel='RAZORPAYX' AND status='SUBMITTING' AND provider_id IS NULL AND lease_until<now()");
    }
    private BigDecimal sumAvailable(UUID chef,Instant now,boolean automatic) {return jdbc.queryForObject("SELECT coalesce(sum(p.amount),0) FROM payment_schema.finance_payable p WHERE p.chef_identity_id=? AND "+(automatic?"automatic_due_at":"manual_available_at")+"<=? AND NOT EXISTS(SELECT 1 FROM payment_schema.finance_payout_allocation a WHERE a.payable_id=p.id AND a.active)",BigDecimal.class,chef,Timestamp.from(now));}
    private boolean isHeld(UUID chef) {return jdbc.query("SELECT on_hold OR NOT payment_schema.finance_bank_ready(chef_identity_id,beneficiary_id) FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",(rs,n)->rs.getBoolean(1),chef).stream().findFirst().orElse(true);}
    private boolean usedDay(UUID chef,LocalDate day) {return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.finance_manual_withdrawal_day WHERE chef_identity_id=? AND business_date=?)",Boolean.class,chef,java.sql.Date.valueOf(day)));}
    private void lockChef(UUID chef) {jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},"chef-payout/"+chef);}
    private Payout get(UUID id) {return jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction WHERE id=?",this::map,id).getFirst();}
    private Payout map(ResultSet rs,int n)throws SQLException {return new Payout(rs.getObject("id",UUID.class),LedgerMoney.text(rs.getBigDecimal("amount")),rs.getString("mode"),rs.getString("status"),rs.getString("provider_status"),rs.getString("transfer_reference"),rs.getTimestamp("created_at").toInstant(),rs.getString("payout_channel"));}
    private void audit(UUID payout,UUID chef,String action,String actor,String evidence) {jdbc.update("INSERT INTO payment_schema.finance_payout_audit(id,instruction_id,chef_identity_id,action,actor,evidence_reference) VALUES (?,?,?,?,?,?)",UUID.randomUUID(),payout,chef,action,actor,evidence);}
    private static void chef(CravesPrincipal actor) {if(actor==null || actor.identityId()==null || !actor.hasRole("CHEF"))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Chef role is required");}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("Invalid snapshot",e);}}
    private FinancePolicy decode(String value){try{return json.readValue(value,FinancePolicy.class);}catch(Exception e){throw new IllegalStateException("Invalid stored policy",e);}}
    private static ResponseStatusException conflict(String value){return new ResponseStatusException(HttpStatus.CONFLICT,value);}
    private record Payable(UUID id,BigDecimal amount) {}
}
