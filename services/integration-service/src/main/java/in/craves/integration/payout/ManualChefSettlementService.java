package in.craves.integration.payout;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Records externally executed Craves bank payments. Contains no provider or money-sending client. */
@Service
public class ManualChefSettlementService {
    public record Reservation(UUID requestKey, String expectedAvailableAmount, String reason) {}
    public enum Action { AUTHORIZE_TRANSFER, CONFIRM_PAID, MARK_UNKNOWN, CANCEL_RESERVATION, CONFIRM_NOT_SENT, CONFIRM_REVERSED }
    public record Change(UUID actionKey, long expectedVersion, Action action, String reason,
                         String destinationReference, String evidenceReference, String bankReference,
                         String amount, Instant paidAt) {}
    public record Instruction(UUID id, UUID chefIdentityId, String amount, String status, long version,
                              String destinationReference, String bankReference, Instant authorizedAt,
                              Instant paidAt, Instant createdAt) {}
    public record Balance(UUID chefIdentityId, String available, boolean onHold, boolean enabled,
                          boolean manualRequestUsedToday, List<Instruction> recent) {}
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final FinancePolicyService policies;
    private final LedgerPostingService ledger;
    private final boolean configured;

    public ManualChefSettlementService(JdbcTemplate jdbc, ObjectMapper json, FinancePolicyService policies,
            LedgerPostingService ledger, @Value("${CRAVES_MANUAL_SETTLEMENT_ENABLED:false}") boolean configured) {
        this.jdbc=jdbc; this.json=json; this.policies=policies; this.ledger=ledger; this.configured=configured;
    }
    public boolean configured() { return configured; }
    public boolean enabled() { var p=policies.current(); return configured && p.policyId()!=null && p.settings().ledgerEnabled() && p.settings().manualWithdrawalsEnabled(); }
    public boolean held(UUID chef) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT payment_schema.finance_manual_money_held(?)",Boolean.class,chef)); }
    public BigDecimal available(UUID chef) {
        return held(chef)?BigDecimal.ZERO:jdbc.queryForObject("SELECT coalesce(sum(p.amount),0) FROM payment_schema.finance_payable p WHERE p.chef_identity_id=? AND p.manual_available_at<=now() AND NOT EXISTS(SELECT 1 FROM payment_schema.finance_payout_allocation a WHERE a.payable_id=p.id AND a.active)",BigDecimal.class,chef);
    }
    public Balance balance(CravesPrincipal actor, UUID chef) {
        FinancePolicyService.reader(actor); requireChefId(chef);
        return new Balance(chef,LedgerMoney.text(available(chef)),held(chef),enabled(),usedToday(chef),listForChef(chef));
    }
    public List<Instruction> list(CravesPrincipal actor) {
        FinancePolicyService.reader(actor);
        return jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction WHERE payout_channel='CRAVES_MANUAL' ORDER BY created_at DESC,id DESC LIMIT 100",this::map);
    }
    private List<Instruction> listForChef(UUID chef) {
        return jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction WHERE payout_channel='CRAVES_MANUAL' AND chef_identity_id=? ORDER BY created_at DESC,id DESC LIMIT 100",this::map,chef);
    }
    @Transactional
    public Instruction reserveAdmin(CravesPrincipal actor, UUID chef, Reservation request) {
        FinancePolicyService.operator(actor); requireChefId(chef);
        if(request==null) throw bad("Reservation is required");
        return reserve(actor,chef,request);
    }
    @Transactional
    public Instruction reserveChef(CravesPrincipal actor, ChefPayoutService.Withdrawal request) {
        if(actor==null || actor.identityId()==null || !actor.hasRole("CHEF")) throw forbidden();
        if(request==null) throw bad("Withdrawal is required");
        return reserve(actor,actor.identityId(),new Reservation(request.requestKey(),request.expectedAvailableAmount(),"Chef requested available balance"));
    }
    private Instruction reserve(CravesPrincipal actor,UUID chef,Reservation request) {
        if(request.requestKey()==null) throw bad("A stable request UUID is required");
        String reason=FinancePolicyService.reason(request.reason());
        BigDecimal expected=exactMoney(request.expectedAvailableAmount());
        String hash=hash(List.of(chef.toString(),request.requestKey().toString(),LedgerMoney.text(expected),reason));
        lockChef(chef);
        var prior=jdbc.queryForList("SELECT id,payout_channel,manual_request_hash FROM payment_schema.finance_payout_instruction WHERE chef_identity_id=? AND request_key=?",chef,request.requestKey());
        if(!prior.isEmpty()) {
            var p=prior.getFirst();
            if(!"CRAVES_MANUAL".equals(p.get("payout_channel")) || !hash.equals(p.get("manual_request_hash"))) throw conflict("Request identity was reused with different settlement context");
            return get((UUID)p.get("id"));
        }
        requireEnabled();
        if(held(chef)) throw conflict("Chef payment is held for financial review");
        if(usedToday(chef)) throw conflict("One accepted withdrawal is allowed per Asia/Kolkata calendar day");
        var rows=jdbc.query("SELECT p.id,p.amount FROM payment_schema.finance_payable p WHERE p.chef_identity_id=? AND p.manual_available_at<=now() AND NOT EXISTS(SELECT 1 FROM payment_schema.finance_payout_allocation a WHERE a.payable_id=p.id AND a.active) ORDER BY p.id FOR UPDATE",
                (rs,n)->new Payable(rs.getObject(1,UUID.class),rs.getBigDecimal(2)),chef);
        BigDecimal total=rows.stream().map(Payable::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
        if(total.signum()<=0 || total.compareTo(expected)!=0) throw conflict("Available balance changed or is empty; refresh before reserving");
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO payment_schema.finance_payout_instruction(id,chef_identity_id,request_key,mode,amount,status,policy_revision,payout_channel,manual_request_hash) VALUES (?,?,?,'MANUAL',?,'RESERVED',?,'CRAVES_MANUAL',?)",
                id,chef,request.requestKey(),total,policies.current().revision(),hash);
        for(var row:rows) jdbc.update("INSERT INTO payment_schema.finance_payout_allocation(instruction_id,payable_id) VALUES (?,?)",id,row.id());
        jdbc.update("INSERT INTO payment_schema.finance_manual_withdrawal_day(chef_identity_id,business_date,instruction_id) VALUES (?,?,?)",chef,java.sql.Date.valueOf(Instant.now().atZone(FinancePolicy.ZONE).toLocalDate()),id);
        audit(id,chef,actor,"MANUAL_RESERVED",reason);
        return get(id);
    }
    @Transactional
    public Instruction change(CravesPrincipal actor,UUID id,Change input) {
        FinancePolicyService.operator(actor);
        Change request=normalize(input);
        var found=jdbc.queryForList("SELECT chef_identity_id FROM payment_schema.finance_payout_instruction WHERE id=? AND payout_channel='CRAVES_MANUAL'",id);
        if(found.isEmpty()) throw missing();
        UUID chef=(UUID)found.getFirst().get("chef_identity_id");lockChef(chef);
        var row=jdbc.queryForMap("SELECT * FROM payment_schema.finance_payout_instruction WHERE id=? FOR UPDATE",id);
        String requestHash=hash(request);
        var prior=jdbc.queryForList("SELECT request_hash FROM payment_schema.finance_manual_settlement_action WHERE instruction_id=? AND action_key=?",id,request.actionKey());
        if(!prior.isEmpty()) {
            if(!requestHash.equals(prior.getFirst().get("request_hash"))) throw conflict("Action identity was reused with changed evidence");
            return get(id);
        }
        long version=((Number)row.get("manual_version")).longValue();
        if(version!=request.expectedVersion()) throw conflict("Settlement changed; refresh before acting");
        String state=(String)row.get("status");
        String target=switch(request.action()) {
            case AUTHORIZE_TRANSFER -> { requireState(state,"RESERVED"); requireEnabled(); if(held(chef))throw conflict("Chef payment is held for financial review"); yield "SUBMITTING"; }
            case CANCEL_RESERVATION -> { requireState(state,"RESERVED"); yield "CANCELLED"; }
            case MARK_UNKNOWN -> { requireState(state,"SUBMITTING"); yield "UNKNOWN"; }
            case CONFIRM_PAID -> { requireState(state,"SUBMITTING","UNKNOWN","REVIEW_REQUIRED"); validateMoneyEvidence(row,request,false); yield "PAID"; }
            case CONFIRM_NOT_SENT -> { requireState(state,"SUBMITTING","UNKNOWN","REVIEW_REQUIRED"); yield "FAILED"; }
            case CONFIRM_REVERSED -> { requireState(state,"PAID"); validateMoneyEvidence(row,request,true); yield "REVERSED"; }
        };
        UUID journal=null;
        if(request.action()==Action.CONFIRM_PAID || request.action()==Action.CONFIRM_REVERSED) {
            boolean reversal=request.action()==Action.CONFIRM_REVERSED;
            BigDecimal amount=(BigDecimal)row.get("amount");
            var lines=reversal?inverse((UUID)row.get("settlement_journal_id")):List.of(
                    new LedgerJournal.Line("CHEF_PAYABLE","INR",LedgerMoney.text(amount),"0.00",chef,null,null,null,null,id),
                    new LedgerJournal.Line("BANK","INR","0.00",LedgerMoney.text(amount),chef,null,null,null,null,id));
            String key="chef-manual-payout/"+id+(reversal?"/reversed":"/confirmed");
            var receipt=ledger.post(new LedgerJournal.Entry(key,UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)),"craves-manual",
                    reversal?"CHEF_MANUAL_PAYOUT_REVERSED":"CHEF_MANUAL_PAYOUT_CONFIRMED",null,null,"INR",request.paidAt(),request.evidenceReference(),
                    reversal?(UUID)row.get("settlement_journal_id"):null,"HUMAN",actor.identityId().toString(),lines));
            if(receipt.outcome()==LedgerJournal.Outcome.CONFLICT) {
                jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,hold_kind='OPERATIONAL',hold_reason='Manual settlement journal conflict requires review',updated_at=now() WHERE chef_identity_id=?",chef);
                audit(id,chef,actor,"MANUAL_JOURNAL_CONFLICT",request.reason());
                return get(id); // Commit the immutable ledger conflict; no state or allocation change.
            }
            journal=receipt.transactionId();
        }
        jdbc.update("INSERT INTO payment_schema.finance_manual_settlement_action(id,instruction_id,action_key,request_hash,action,from_status,to_status,result_version,operator_id,reason,evidence_reference,destination_reference,bank_reference,amount,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(),id,request.actionKey(),requestHash,request.action().name(),state,target,version+1,actor.identityId(),request.reason(),request.evidenceReference(),request.destinationReference(),request.bankReference(),request.amount()==null?null:exactMoney(request.amount()),timestamp(request.paidAt()));
        switch(request.action()) {
            case AUTHORIZE_TRANSFER -> jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status=?,manual_version=manual_version+1,manual_destination_reference=?,manual_authorized_at=now(),updated_at=now() WHERE id=?",target,request.destinationReference(),id);
            case CONFIRM_PAID -> jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status=?,manual_version=manual_version+1,manual_paid_at=?,transfer_reference=?,settlement_journal_id=?,updated_at=now() WHERE id=?",target,timestamp(request.paidAt()),request.bankReference(),journal,id);
            case CONFIRM_REVERSED -> jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status=?,manual_version=manual_version+1,reversal_journal_id=?,updated_at=now() WHERE id=?",target,journal,id);
            default -> jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status=?,manual_version=manual_version+1,updated_at=now() WHERE id=?",target,id);
        }
        if(Set.of("CANCELLED","FAILED","REVERSED").contains(target)) jdbc.update("UPDATE payment_schema.finance_payout_allocation SET active=false WHERE instruction_id=? AND active",id);
        if(Set.of("UNKNOWN","FAILED","REVERSED").contains(target)) jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,hold_kind='OPERATIONAL',hold_reason='Manual bank payment requires operational review',updated_at=now() WHERE chef_identity_id=?",chef);
        audit(id,chef,actor,"MANUAL_"+request.action(),request.reason());return get(id);
    }
    private Change normalize(Change r) {
        if(r==null || r.actionKey()==null || r.expectedVersion()<0 || r.action()==null) throw bad("A stable action identity, version and action are required");
        String reason=FinancePolicyService.reason(r.reason());
        String destination=reference(r.destinationReference(),240),evidence=reference(r.evidenceReference(),240),bank=reference(r.bankReference(),160);
        boolean money=r.action()==Action.CONFIRM_PAID || r.action()==Action.CONFIRM_REVERSED;
        if((r.action()==Action.AUTHORIZE_TRANSFER)!=(destination!=null)) throw bad("Destination evidence is required only when authorizing the external transfer");
        if((money || r.action()==Action.CONFIRM_NOT_SENT)!=(evidence!=null)) throw bad("Bank outcome evidence is required for this action");
        if(money) {
            if(r.paidAt()==null || r.amount()==null) throw bad("Exact bank amount and actual payment time are required");
            exactMoney(r.amount());
        } else if(r.amount()!=null || r.paidAt()!=null || bank!=null) throw bad("Payment fields do not apply to this action");
        return new Change(r.actionKey(),r.expectedVersion(),r.action(),reason,destination,evidence,bank,r.amount(),r.paidAt()==null?null:r.paidAt().truncatedTo(ChronoUnit.MICROS));
    }
    private void validateMoneyEvidence(java.util.Map<String,Object> row,Change r,boolean reversal) {
        if(((BigDecimal)row.get("amount")).compareTo(exactMoney(r.amount()))!=0) throw conflict("Bank amount must equal the reserved amount");
        Timestamp start=(Timestamp)row.get(reversal?"manual_paid_at":"manual_authorized_at");
        if(start==null || r.paidAt().isBefore(start.toInstant()) || r.paidAt().isAfter(Instant.now().plusSeconds(30))) throw bad("Bank time must follow authorization and cannot be in the future");
    }
    private List<LedgerJournal.Line> inverse(UUID id) {
        return jdbc.query("SELECT * FROM payment_schema.ledger_line WHERE transaction_id=? ORDER BY sequence",(rs,n)->new LedgerJournal.Line(rs.getString("account_code"),rs.getString("currency"),LedgerMoney.text(rs.getBigDecimal("credit_amount")),LedgerMoney.text(rs.getBigDecimal("debit_amount")),rs.getObject("chef_identity_id",UUID.class),rs.getObject("delivery_attempt_id",UUID.class),rs.getString("provider_id"),rs.getObject("payment_id",UUID.class),rs.getObject("refund_id",UUID.class),rs.getObject("payout_instruction_id",UUID.class)),id);
    }
    private Instruction get(UUID id) { return jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction WHERE id=? AND payout_channel='CRAVES_MANUAL'",this::map,id).stream().findFirst().orElseThrow(ManualChefSettlementService::missing); }
    private Instruction map(ResultSet rs,int n)throws SQLException { return new Instruction(rs.getObject("id",UUID.class),rs.getObject("chef_identity_id",UUID.class),LedgerMoney.text(rs.getBigDecimal("amount")),rs.getString("status"),rs.getLong("manual_version"),rs.getString("manual_destination_reference"),rs.getString("transfer_reference"),instant(rs.getTimestamp("manual_authorized_at")),instant(rs.getTimestamp("manual_paid_at")),rs.getTimestamp("created_at").toInstant()); }
    private boolean usedToday(UUID chef) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.finance_manual_withdrawal_day WHERE chef_identity_id=? AND business_date=?)",Boolean.class,chef,java.sql.Date.valueOf(Instant.now().atZone(FinancePolicy.ZONE).toLocalDate()))); }
    private void requireEnabled() { if(!enabled())throw conflict("Manual Craves settlement is not enabled by the reviewed policy"); }
    private void lockChef(UUID chef) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},"chef-payout/"+chef);
        // Serialize new decisions with source/refund triggers that establish a chef hold.
        jdbc.query("SELECT chef_identity_id FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=? FOR UPDATE",rs->{return null;},chef);
    }
    private void audit(UUID id,UUID chef,CravesPrincipal actor,String action,String reason) { jdbc.update("INSERT INTO payment_schema.finance_payout_audit(id,instruction_id,chef_identity_id,action,actor,evidence_reference) VALUES (?,?,?,?,?,?)",UUID.randomUUID(),id,chef,action,actor.identityId().toString(),reason.substring(0,Math.min(reason.length(),500))); }
    private String hash(Object value) { try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(value)));}catch(Exception e){throw bad("Invalid settlement context");} }
    private static BigDecimal exactMoney(String value) { if(value==null || !value.matches("[0-9]{1,14}\\.[0-9]{2}"))throw bad("Amount must be an exact decimal string with two fractional digits");return LedgerMoney.parse(value); }
    private static String reference(String value,int max) { if(value==null)return null;value=value.trim();if(value.isEmpty() || value.length()>max || value.chars().anyMatch(Character::isISOControl))throw bad("Invalid evidence reference");return value; }
    private static void requireState(String state,String...allowed) { if(!Set.of(allowed).contains(state))throw conflict("Action does not apply to the current settlement state"); }
    private static void requireChefId(UUID chef) { if(chef==null)throw bad("Chef identity is required"); }
    private static Instant instant(Timestamp value) { return value==null?null:value.toInstant(); }
    private static Timestamp timestamp(Instant value) { return value==null?null:Timestamp.from(value); }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"Manual settlement not found"); }
    private static ResponseStatusException forbidden() { return new ResponseStatusException(HttpStatus.FORBIDDEN,"Chef role is required"); }
    private record Payable(UUID id,BigDecimal amount) {}
}
