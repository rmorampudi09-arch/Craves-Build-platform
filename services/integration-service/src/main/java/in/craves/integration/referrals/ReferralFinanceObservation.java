package in.craves.integration.referrals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.referrals.transport.ReferralOutbox;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Reconciles only explicitly bound referral orders against Finance's own verified capture and refund records. */
@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralFinanceObservation {
    private final JdbcTemplate db;private final ObjectMapper json;private final ReferralOutbox outbox;private final TransactionTemplate tx;
    public ReferralFinanceObservation(JdbcTemplate db,ObjectMapper json,ReferralOutbox outbox,PlatformTransactionManager manager){this.db=db;this.json=json;this.outbox=outbox;this.tx=new TransactionTemplate(manager);}
    @Scheduled(scheduler="referralTaskScheduler",fixedDelayString="${CRAVES_REFERRAL_FINANCE_OBSERVATION_POLL_MS:5000}")
    public void refresh(){for(int n=0;n<20;n++)if(!observeOne())return;}
    public boolean observeOne(){return Boolean.TRUE.equals(tx.execute(s->{
        var rows=db.queryForList("SELECT * FROM payment_schema.referral_finance_binding WHERE next_observation_at<=now() ORDER BY next_observation_at,chef_order_id LIMIT 1 FOR UPDATE SKIP LOCKED");
        if(rows.isEmpty())return false;var binding=rows.getFirst();UUID order=(UUID)binding.get("chef_order_id"),checkout=(UUID)binding.get("checkout_id");
        JsonNode snapshot=parse(db.queryForObject("SELECT payload::text FROM payment_schema.finance_issued_snapshot WHERE chef_order_id=? AND snapshot_hash=?",String.class,order,binding.get("source_hash")));
        var captures=db.queryForList("SELECT c.* FROM payment_schema.finance_capture c JOIN payment_schema.payment_order p ON p.id=c.payment_order_id WHERE c.checkout_id=? AND p.status='PAID' AND p.provider='RAZORPAY' AND p.provider_payment_id=c.provider_payment_id AND p.amount=c.captured_amount AND p.currency='INR' AND lower(p.provider_status) IN ('captured','paid')",checkout);
        var funding=db.queryForList("SELECT c.gross_paise FROM payment_schema.referral_funding_capture c JOIN payment_schema.payment_order p ON p.id=c.payment_order_id WHERE c.checkout_id=? AND p.status='PAID' AND p.currency='INR' AND p.amount*100=c.gateway_paise AND ((c.gateway_paise=0 AND p.provider='REFERRAL_WALLET') OR (c.gateway_paise>0 AND p.provider='RAZORPAY' AND p.provider_payment_id=c.provider_payment_id AND lower(p.provider_status) IN ('captured','paid')))",checkout);
        long captured=captures.size()==1?paise((BigDecimal)captures.getFirst().get("captured_amount")):0;
        // M24a: a Craves-funded promotion is part of what the checkout was paid with (customer funds = gross).
        if(captured>0)captured+=db.queryForList("SELECT discount_paise FROM payment_schema.promotion_checkout_funding WHERE checkout_id=?",Long.class,checkout).stream().mapToLong(Long::longValue).sum();
        // M24d: so is a company share (billed to the company on its M10 statement).
        if(captured>0)captured+=db.queryForList("SELECT company_share_paise FROM payment_schema.company_share_checkout_funding WHERE checkout_id=?",Long.class,checkout).stream().mapToLong(Long::longValue).sum();
        if(captured==0 && funding.size()==1)captured=((Number)funding.getFirst().get("gross_paise")).longValue();
        long food=paise(new BigDecimal(snapshot.path("customerFood").asText()));
        BigDecimal total=new BigDecimal(snapshot.path("customerTotal").asText());
        var refunds=db.queryForList("SELECT status,amount FROM payment_schema.refund WHERE chef_sub_order_id=? AND status NOT IN ('FAILED','CANCELLED')",order);
        boolean unresolved=false;long refunded=0;
        if(!refunds.isEmpty()){
            if(refunds.size()==1 && "SUCCESS".equals(refunds.getFirst().get("status")) && total.compareTo((BigDecimal)refunds.getFirst().get("amount"))==0)refunded=food;
            else unresolved=true;
        }
        var split=db.queryForList("SELECT state,gross_paise FROM payment_schema.referral_refund_allocation WHERE chef_order_id=?",order);
        if(!split.isEmpty()) {var r=split.getFirst();unresolved=!"COMPLETE".equals(r.get("state")) || total.movePointRight(2).longValueExact()!=((Number)r.get("gross_paise")).longValue();refunded=unresolved?0:food;}
        boolean verified=(captures.size()==1 || funding.size()==1) && !unresolved;
        boolean earned=Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.finance_order_binding WHERE chef_order_id=? AND state='DELIVERED' AND earning_journal_id IS NOT NULL)",Boolean.class,order));
        long budget=verified && earned && refunded==0?paise(new BigDecimal(snapshot.path("chefServiceFee").asText())):0;
        int version=Math.addExact(((Number)binding.get("source_version")).intValue(),1);Instant at=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        var payload=json.createObjectNode().put("chefOrderId",order.toString()).put("version",version).put("sourceSnapshotHash",binding.get("source_hash").toString())
            .put("verifiedCapture",verified).put("capturedCheckoutPaise",Long.toString(captured)).put("commissionBudgetPaise",Long.toString(budget))
            .put("cumulativeFoodRefundPaise",Long.toString(refunded)).put("observedAt",at.toString()).put("evidenceRef","finance-source/"+order+"/"+version).put("currency","INR");
        // Conservatively use the immutable finance capture receipt, never an untrusted client time.
        if(captures.size()==1 && verified) payload.put("paidAt",((java.sql.Timestamp)captures.getFirst().get("recorded_at")).toInstant().toString());
        int idle=verified && earned?86400:60;
        // Same facts as the last event are not a new event: this ran about every 11 s for 24 orders and wrote 7.4M identical rows (Nov 2026).
        // A refresh the referral service asked for is still answered, because it checks how recent the observation is.
        if(!Boolean.TRUE.equals(binding.get("refresh_requested")) && sameFacts(previous(order,version-1),payload)){
            db.update("UPDATE payment_schema.referral_finance_binding SET next_observation_at=now()+(?*interval '1 second') WHERE chef_order_id=?",idle,order);
            return true;
        }
        outbox.enqueue("finance/"+order+"/"+version,"order.finance_confirmed",order,at,payload);
        db.update("UPDATE payment_schema.referral_finance_binding SET source_version=?,refresh_requested=false,next_observation_at=now()+(?*interval '1 second') WHERE chef_order_id=?",version,idle,order);
        return true;
    }));}
    private JsonNode previous(UUID order,int version){
        var rows=db.queryForList("SELECT envelope FROM payment_schema.referral_source_outbox WHERE event_key=?",String.class,"finance/"+order+"/"+version);
        return rows.isEmpty()?null:parse(rows.getFirst()).path("payload");
    }
    /** True when both payloads carry the same facts; version, observedAt and evidenceRef differ on every observation. */
    static boolean sameFacts(JsonNode before,JsonNode now){
        if(before==null || !before.isObject())return false;
        var a=((com.fasterxml.jackson.databind.node.ObjectNode)before).deepCopy();var b=((com.fasterxml.jackson.databind.node.ObjectNode)now).deepCopy();
        for(String field:java.util.List.of("version","observedAt","evidenceRef")){a.remove(field);b.remove(field);}
        return a.equals(b);
    }
    private JsonNode parse(String body){try{return json.readTree(body);}catch(Exception e){throw new IllegalStateException("Invalid financial snapshot",e);}}
    private static long paise(BigDecimal amount){if(amount.signum()<0)throw new IllegalArgumentException("Nonnegative finance money required");return amount.movePointRight(2).longValueExact();}
}
