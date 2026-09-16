package in.craves.integration.referrals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.source.FinancialJson;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerPostingService;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Runs inside the durable consumer transaction. No payout/provider call is made here. */
public final class ChefReferralEarningsMirror {
    private final JdbcTemplate db; private final LedgerPostingService ledger;
    public ChefReferralEarningsMirror(JdbcTemplate db,LedgerPostingService ledger) {this.db=db;this.ledger=ledger;}
    public void apply(UUID event,JsonNode body) {
        Set<String> fields=Set.of("postingId","rewardId","chefOrderId","checkoutId","sellingChefId","beneficiaryId",
            "amountPaise","originalPostingId","postingMonth","postedAt","policyVersion","currency");
        body.fieldNames().forEachRemaining(name->{if(!fields.contains(name)) throw new IllegalArgumentException("UNKNOWN_CHEF_EARNING_FIELD");});
        if(!"CHEF_COMMISSION_20260916".equals(body.path("policyVersion").asText()) || !"INR".equals(body.path("currency").asText()))
            throw new IllegalArgumentException("CHEF_REFERRAL_POLICY_REQUIRED");
        UUID posting=id(body,"postingId"), reward=id(body,"rewardId"), order=id(body,"chefOrderId"), checkout=id(body,"checkoutId");
        UUID owner=id(body,"beneficiaryId"), seller=id(body,"sellingChefId");
        if(owner.equals(seller)) throw new IllegalArgumentException("SELF_CHEF_REFERRAL_FORBIDDEN");
        long amount=ReferralJournalMirror.delta(body,"amountPaise");
        if(amount==0 || Math.abs(amount)>150000) throw new IllegalArgumentException("INVALID_CHEF_REFERRAL_AMOUNT");
        Instant at=Instant.parse(body.path("postedAt").asText());
        if(at.isAfter(Instant.now().plusSeconds(60)) || at.getNano()%1000!=0) throw new IllegalArgumentException("INVALID_CHEF_POSTING_TIME");
        LocalDate month=LocalDate.parse(body.path("postingMonth").asText());
        if(month.getDayOfMonth()!=1) throw new IllegalArgumentException("INVALID_POSTING_MONTH");
        UUID original=body.hasNonNull("originalPostingId")?id(body,"originalPostingId"):null;
        String hash=FinancialJson.hash(body,new ObjectMapper());
        lock("chef-referral-order:"+order); lock("chef-payout/"+owner);
        var prior=db.queryForList("SELECT payload_hash FROM payment_schema.chef_referral_posting WHERE posting_id=?",posting);
        if(!prior.isEmpty()) {
            if(!hash.equals(prior.getFirst().get("payload_hash"))) throw new IllegalStateException("CHEF_POSTING_REPLAY_CONFLICT");
            return;
        }
        if(amount>0) {
            if(original!=null || !month.equals(at.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate().withDayOfMonth(1))) throw new IllegalArgumentException("INVALID_CHEF_CREDIT_MONTH");
            var source=db.queryForList("SELECT e.service_fee,(s.payload->>'customerFood')::numeric AS food FROM payment_schema.finance_earning_projection e JOIN payment_schema.finance_issued_snapshot s ON s.id=e.snapshot_id JOIN payment_schema.finance_order_binding b ON b.chef_order_id=e.chef_order_id AND b.earning_journal_id=e.journal_id JOIN payment_schema.finance_capture c ON c.checkout_id=e.checkout_id JOIN payment_schema.payment_order p ON p.id=c.payment_order_id WHERE e.chef_order_id=? AND e.checkout_id=? AND e.chef_identity_id=? AND b.state='DELIVERED' AND p.status='PAID' AND p.provider='RAZORPAY' AND p.provider_payment_id=c.provider_payment_id AND p.currency='INR' AND p.amount=c.captured_amount AND lower(p.provider_status) IN ('captured','paid')",order,checkout,seller);
            if(source.size()!=1) throw new IllegalStateException("AUTHORITATIVE_CHEF_EARNING_REQUIRED");
            var refunds=db.queryForList("SELECT created_at FROM payment_schema.refund WHERE chef_sub_order_id=? AND status NOT IN ('FAILED','CANCELLED')",order);
            if(refunds.stream().anyMatch(refund->at.isAfter(((Timestamp)refund.get("created_at")).toInstant())))
                throw new IllegalStateException("CHEF_REFERRAL_REFUND_RECONCILIATION_REQUIRED");
            // A signed historical credit may arrive after its refund. Preserve the credit so its
            // compensating debit can apply, but block settlement until the exposure is reviewed.
            if(!refunds.isEmpty()) hold(owner);
            long used=count("SELECT coalesce(sum(amount_paise),0) FROM payment_schema.chef_referral_posting WHERE chef_order_id=?",order);
            long commission=((BigDecimal)source.getFirst().get("service_fee")).movePointRight(2).longValueExact();
            long food=((BigDecimal)source.getFirst().get("food")).movePointRight(2).longValueExact();
            if(food<=25000 || used+amount>commission || used+amount>BigDecimal.valueOf(food).multiply(new BigDecimal("0.04")).longValue())
                throw new IllegalStateException("CHEF_REFERRAL_COMMISSION_EXCEEDED");
            long monthly=count("SELECT coalesce(sum(amount_paise),0) FROM payment_schema.chef_referral_posting WHERE beneficiary_id=? AND posting_month=?",owner,Date.valueOf(month));
            if(monthly+amount>150000) throw new IllegalStateException("CHEF_REFERRAL_MONTHLY_CAP_EXCEEDED");
        } else {
            if(original==null) throw new IllegalArgumentException("ORIGINAL_CHEF_POSTING_REQUIRED");
            var rows=db.queryForList("SELECT r.*,t.checkout_id FROM payment_schema.chef_referral_posting r JOIN payment_schema.ledger_transaction t ON t.id=r.journal_id WHERE r.posting_id=? AND r.amount_paise>0",original);
            if(rows.size()!=1) throw new IllegalStateException("ORIGINAL_CHEF_POSTING_NOT_RECEIVED");
            var credit=rows.getFirst();
            if(!checkout.equals(credit.get("checkout_id")) || !owner.equals(credit.get("beneficiary_id")) || !order.equals(credit.get("chef_order_id")) || !seller.equals(credit.get("selling_chef_id"))
                || !reward.equals(credit.get("reward_id")) || !Date.valueOf(month).equals(credit.get("posting_month")) || at.isBefore(((Timestamp)credit.get("posted_at")).toInstant()))
                throw new IllegalStateException("CHEF_REVERSAL_SOURCE_MISMATCH");
            long net=((Number)credit.get("amount_paise")).longValue()+count("SELECT coalesce(sum(amount_paise),0) FROM payment_schema.chef_referral_posting WHERE original_posting_id=?",original);
            if(net+amount<0) throw new IllegalStateException("CHEF_REVERSAL_EXCEEDS_CREDIT");
            hold(owner);
        }
        BigDecimal money=BigDecimal.valueOf(Math.abs(amount),2);
        var lines=amount>0?List.of(LedgerJournal.Line.debit("REFERRAL_UPLINE_EXPENSE",money,null),LedgerJournal.Line.credit("CHEF_PAYABLE",money,owner))
            :List.of(LedgerJournal.Line.debit("CHEF_PAYABLE",money,owner),LedgerJournal.Line.credit("REFERRAL_UPLINE_EXPENSE",money,null));
        var entry=new LedgerJournal.Entry("chef-referral/"+posting,event,"referral-service","CHEF_REFERRAL_EARNING",checkout,order,"INR",at,
            "chef-referral/"+posting,null,"SERVICE","referral-finance-consumer",lines);
        var result=ledger.post(entry);
        if(result.outcome()==LedgerJournal.Outcome.CONFLICT) throw new IllegalStateException("CHEF_REFERRAL_LEDGER_CONFLICT");
        db.update("INSERT INTO payment_schema.chef_referral_posting(posting_id,reward_id,chef_order_id,beneficiary_id,selling_chef_id,amount_paise,original_posting_id,posting_month,posted_at,payload_hash,journal_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            posting,reward,order,owner,seller,amount,original,Date.valueOf(month),Timestamp.from(at),hash,result.transactionId());
    }
    private void lock(String key) {db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},key);}
    private void hold(UUID owner) {
        db.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_kind,hold_reason) VALUES (?,true,'OPERATIONAL','Referral refund requires settlement reconciliation') ON CONFLICT(chef_identity_id) DO UPDATE SET on_hold=true,hold_kind='OPERATIONAL',hold_reason=EXCLUDED.hold_reason,updated_at=now()",owner);
    }
    private long count(String sql,Object... args) {return db.queryForObject(sql,Long.class,args);}
    private static UUID id(JsonNode body,String field) {return UUID.fromString(body.path(field).asText());}
}
