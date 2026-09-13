package in.craves.integration.payout;

import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.security.CravesPrincipal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Recovery fetches an existing provider payout; this service has no provider POST path. */
@Service
public class FinancePayoutReconciliationService {
    public record Request(String providerPayoutId,String reason) {}
    public record Result(UUID instructionId,String status,String providerStatus,String notice) {}
    private final JdbcTemplate jdbc;
    private final RazorpayXPayoutClient provider;
    private final ChefPayoutService payouts;
    private final LedgerPostingService ledger;
    private final TransactionTemplate transaction;
    public FinancePayoutReconciliationService(JdbcTemplate jdbc,RazorpayXPayoutClient provider,
        ChefPayoutService payouts,LedgerPostingService ledger,PlatformTransactionManager manager) {
        this.jdbc=jdbc;this.provider=provider;this.payouts=payouts;this.ledger=ledger;
        this.transaction=new TransactionTemplate(manager);
    }
    public Result reconcile(CravesPrincipal actor,UUID id,Request request) {
        FinancePolicyService.operator(actor);
        if(request==null || request.providerPayoutId()==null || !request.providerPayoutId().matches("pout_[A-Za-z0-9]+"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"An existing RazorpayX payout ID is required");
        String reason=FinancePolicyService.reason(request.reason());
        Map<String,Object> before=load(id,false);
        if("RESERVED".equals(before.get("status"))) throw conflict("This instruction has not been submitted; do not attach an unrelated payout");
        String existing=(String)before.get("provider_id");
        if(existing!=null && !existing.equals(request.providerPayoutId())) throw conflict("Original provider payout identity cannot be changed");
        var context=new RazorpayXPayoutClient.Instruction(id,before.get("fund_account_id").toString(),
            LedgerMoney.text((java.math.BigDecimal)before.get("amount")),request.providerPayoutId());
        // Network call happens before taking any database lock. All response dimensions are verified by the adapter.
        var receipt=provider.fetch(context);
        if(!request.providerPayoutId().equals(receipt.payoutId())) throw conflict("Provider reconciliation identity differs");
        return transaction.execute(status->apply(actor,id,receipt,reason));
    }
    private Result apply(CravesPrincipal actor,UUID id,RazorpayXPayoutClient.Receipt receipt,String reason) {
        Map<String,Object> first=load(id,false);
        UUID chef=(UUID)first.get("chef_identity_id");
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},"chef-payout/"+chef);
        Map<String,Object> row=load(id,true);
        String state=row.get("status").toString();String previousProvider=(String)row.get("provider_id");
        if(previousProvider!=null && !previousProvider.equals(receipt.payoutId())) throw conflict("Provider identity changed during reconciliation");
        Timestamp lease=(Timestamp)row.get("lease_until");
        if(lease!=null && lease.toInstant().isAfter(Instant.now())) throw conflict("A payout worker is active; retry after its lease expires");
        if("PAID".equals(state) && "reversed".equals(receipt.status())) return reversePaid(actor,row,receipt,reason);
        if(Set.of("PAID","FAILED","REVERSED").contains(state)) {
            boolean same=("PAID".equals(state) && "processed".equals(receipt.status()))
                || ("FAILED".equals(state) && Set.of("failed","cancelled","rejected").contains(receipt.status()))
                || ("REVERSED".equals(state) && "reversed".equals(receipt.status()));
            if(!same) {
                hold(chef,"Conflicting terminal provider outcome; review original transfer and bank evidence");
                audit(id,chef,actor,"TERMINAL_CONFLICT",reason,receipt.payoutId());
            }
            return new Result(id,state,receipt.status(),same?"Existing confirmed outcome preserved; no new transfer":"Original history preserved and chef held for financial review");
        }
        if("RESERVED".equals(state)) throw conflict("Unsubmitted instruction cannot be reconciled as a transfer");
        UUID leaseId=UUID.randomUUID();
        jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='PROCESSING',provider_id=?,provider_status=?,lease_id=?,lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=?",
            receipt.payoutId(),receipt.status(),leaseId,id);
        var work=new ChefPayoutService.Work(id,leaseId,chef,row.get("fund_account_id").toString(),
            LedgerMoney.text((java.math.BigDecimal)row.get("amount")),receipt.payoutId(),row.get("mode").toString());
        payouts.recordOutcome(work,receipt);
        audit(id,chef,actor,"EXISTING_PAYOUT_RECONCILED",reason,receipt.payoutId());
        String updated=jdbc.queryForObject("SELECT status FROM payment_schema.finance_payout_instruction WHERE id=?",String.class,id);
        return new Result(id,updated,receipt.status(),"Existing payout reconciled; no replacement transfer was submitted");
    }
    private Result reversePaid(CravesPrincipal actor,Map<String,Object> row,RazorpayXPayoutClient.Receipt receipt,String reason) {
        UUID id=(UUID)row.get("id"),chef=(UUID)row.get("chef_identity_id"),original=(UUID)row.get("settlement_journal_id");
        if(original==null) throw conflict("Original settlement journal is missing; preserve reservation for review");
        List<LedgerJournal.Line> inverse=jdbc.query("SELECT * FROM payment_schema.ledger_line WHERE transaction_id=? ORDER BY sequence",
            (rs,n)->new LedgerJournal.Line(rs.getString("account_code"),rs.getString("currency"),
                LedgerMoney.text(rs.getBigDecimal("credit_amount")),LedgerMoney.text(rs.getBigDecimal("debit_amount")),
                rs.getObject("chef_identity_id",UUID.class),rs.getObject("delivery_attempt_id",UUID.class),rs.getString("provider_id"),
                rs.getObject("payment_id",UUID.class),rs.getObject("refund_id",UUID.class),rs.getObject("payout_instruction_id",UUID.class)),original);
        String key="chef-payout/"+id+"/confirmed-reversal";
        var posted=ledger.post(new LedgerJournal.Entry(key,UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)),"razorpayx",
            "CHEF_PAYOUT_REVERSED",null,null,"INR",Instant.now(),"razorpayx/"+receipt.payoutId()+"/reversed",original,"HUMAN",actor.identityId().toString(),inverse));
        hold(chef,"Provider reversal confirmed; review beneficiary and funding before any replacement transfer");
        if(posted.outcome()==LedgerJournal.Outcome.CONFLICT) {
            audit(id,chef,actor,"REVERSAL_POSTING_CONFLICT",reason,receipt.payoutId());
            return new Result(id,"PAID",receipt.status(),"Reversal conflict recorded; reservation and original paid history retained");
        }
        jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='REVERSED',provider_status='reversed',reversal_journal_id=?,last_error=NULL,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE id=?",posted.transactionId(),id);
        jdbc.update("UPDATE payment_schema.finance_payout_allocation SET active=false WHERE instruction_id=? AND active",id);
        audit(id,chef,actor,"CONFIRMED_REVERSAL_POSTED",reason,receipt.payoutId());
        return new Result(id,"REVERSED",receipt.status(),"Linked reversal restored the chef liability. Original settlement is retained; chef remains on hold");
    }
    private Map<String,Object> load(UUID id,boolean lock) {
        var rows=jdbc.queryForList("SELECT i.*,b.fund_account_id FROM payment_schema.finance_payout_instruction i JOIN payment_schema.finance_beneficiary_version b ON b.id=i.beneficiary_id WHERE i.id=?"+(lock?" FOR UPDATE OF i":""),id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Payout instruction not found");
        return rows.getFirst();
    }
    private void hold(UUID chef,String reason) {
        jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,hold_reason=?,updated_at=now() WHERE chef_identity_id=?",reason,chef);
    }
    private void audit(UUID id,UUID chef,CravesPrincipal actor,String action,String reason,String providerId) {
        String evidence="razorpayx/"+providerId+" | "+reason;
        jdbc.update("INSERT INTO payment_schema.finance_payout_audit(id,instruction_id,chef_identity_id,action,actor,evidence_reference) VALUES (?,?,?,?,?,?)",
            UUID.randomUUID(),id,chef,action,actor.identityId().toString(),evidence.substring(0,Math.min(evidence.length(),500)));
    }
    private static ResponseStatusException conflict(String message) {return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
