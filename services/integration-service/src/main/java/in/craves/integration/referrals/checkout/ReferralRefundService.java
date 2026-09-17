package in.craves.integration.referrals.checkout;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.finance.source.FinancialJson;
import in.craves.integration.ledger.*;
import in.craves.integration.referrals.transport.ReferralSourceClient;
import in.craves.integration.refund.RefundModels.*;
import in.craves.integration.refund.RefundStatusEventFactory.SerializedRefundStatusEvent;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Refund each tender to its original source; a marketing discount is never returned as customer cash. */
@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED",havingValue="true")
public class ReferralRefundService {
    private final JdbcTemplate db;private final ObjectMapper json;private final ReferralSourceClient client;private final LedgerPostingService ledger;private final TransactionTemplate tx;
    record Work(UUID order,UUID checkout,UUID lease,String envelope) {}
    public ReferralRefundService(JdbcTemplate db,ObjectMapper json,ReferralSourceClient client,LedgerPostingService ledger,PlatformTransactionManager manager){this.db=db;this.json=json;this.client=client;this.ledger=ledger;this.tx=new TransactionTemplate(manager);}
    /** Called inside the existing source-inbox transaction before its provider refund row is inserted. */
    public void verifyReplay(EventEnvelope<RefundRequestedData> event){
        var old=db.queryForList("SELECT source_hash FROM payment_schema.referral_refund_allocation WHERE request_event_id=?",event.eventId());
        if(!old.isEmpty() && !old.getFirst().get("source_hash").equals(FinancialJson.hash(json.valueToTree(event),json)))throw new IllegalStateException("REFERRAL_REFUND_SOURCE_CONFLICT");
    }
    public BigDecimal allocate(EventEnvelope<RefundRequestedData> event,String raw,BigDecimal original){
        var data=event.data();var plans=db.queryForList("SELECT * FROM payment_schema.referral_checkout_funding WHERE checkout_id=?",data.checkoutId());if(plans.isEmpty())return original;var plan=plans.getFirst();
        if(!"CONSUMED".equals(plan.get("state")) || !data.customerIdentityId().equals(plan.get("buyer_id")))throw new IllegalStateException("REFERRAL_REFUND_FUNDING_NOT_CONFIRMED");
        if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.finance_order_binding WHERE chef_order_id=? AND earning_journal_id IS NOT NULL)",Boolean.class,data.chefSubOrderId())))throw new IllegalStateException("DELIVERED_REFERRAL_REFUND_REQUIRES_EARNING_REVERSAL");
        JsonNode allocation=null;for(var child:parse(plan.get("allocation").toString()))if(data.chefSubOrderId().toString().equals(child.path("id").asText()))allocation=child;
        if(allocation==null || allocation.path("grossPaise").longValue()!=original.movePointRight(2).longValueExact())throw new IllegalStateException("REFERRAL_REFUND_ALLOCATION_REVIEW_REQUIRED");
        String hash=FinancialJson.hash(json.valueToTree(event),json);var a=allocation;
        db.update("INSERT INTO payment_schema.referral_refund_allocation(chef_order_id,checkout_id,request_event_id,source_payload,source_hash,gross_paise,wallet_paise,discount_paise,gateway_paise) VALUES (?,?,?,?::jsonb,?,?,?,?,?) ON CONFLICT(chef_order_id) DO NOTHING",data.chefSubOrderId(),data.checkoutId(),event.eventId(),raw,hash,a.path("grossPaise").longValue(),a.path("walletPaise").longValue(),a.path("discountPaise").longValue(),a.path("gatewayPaise").longValue());
        if(!hash.equals(db.queryForObject("SELECT source_hash FROM payment_schema.referral_refund_allocation WHERE chef_order_id=?",String.class,data.chefSubOrderId())))throw new IllegalStateException("REFERRAL_REFUND_SOURCE_CONFLICT");
        db.update("INSERT INTO payment_schema.referral_refund_sequence(checkout_id) VALUES (?) ON CONFLICT DO NOTHING",data.checkoutId());
        return BigDecimal.valueOf(a.path("gatewayPaise").longValue(),2);
    }
    public void inserted(UUID refund,UUID order){db.update("UPDATE payment_schema.refund SET status='BENEFITS_PENDING' WHERE id=? AND amount=0 AND EXISTS(SELECT 1 FROM payment_schema.referral_refund_allocation WHERE chef_order_id=? AND gateway_paise=0)",refund,order);}
    /** Before initial outbox insertion: defer success until every tender has actually been restored. */
    public SerializedRefundStatusEvent customerEvent(SerializedRefundStatusEvent event){
        var rows=db.queryForList("SELECT gross_paise FROM payment_schema.referral_refund_allocation WHERE chef_order_id=?",event.subject());if(rows.isEmpty())return event;
        var p=(ObjectNode)parse(event.payloadJson());var data=(ObjectNode)p.path("data");if("SUCCESS".equals(data.path("status").asText()))return null;
        data.put("refundAmount",BigDecimal.valueOf(((Number)rows.getFirst().get("gross_paise")).longValue(),2));
        return new SerializedRefundStatusEvent(event.eventId(),event.eventType(),event.eventVersion(),event.occurredAt(),event.correlationId(),event.causationId(),event.subject(),p.toString(),event.eventKey());
    }
    @Scheduled(scheduler="referralTaskScheduler",fixedDelayString="${CRAVES_REFERRAL_REFUND_POLL_MS:1000}")public void tick(){for(int i=0;i<20;i++){try{if(!runOne())return;}catch(RuntimeException e){return;}}}
    public boolean runOne(){Work w=claim();if(w==null)return false;try{
        var p=parse(w.envelope()).path("payload");var response=client.send(ReferralSourceClient.Endpoint.OPERATIONS,w.envelope().getBytes(StandardCharsets.UTF_8));
        if(response.status()!=200)throw new IllegalStateException("REFERRAL_REFUND_UNCONFIRMED");var result=json.readTree(response.body());
        if(!w.checkout().toString().equals(result.path("checkoutId").asText()) || result.path("version").intValue()!=p.path("version").intValue() || !p.path("cumulativeWalletPaise").asText().equals(result.path("walletRefundedPaise").asText()) || !p.path("cumulativeDiscountPaise").asText().equals(result.path("discountRefundedPaise").asText()))throw new IllegalStateException("REFERRAL_REFUND_RECEIPT_MISMATCH");
        tx.executeWithoutResult(s->finish(w,p));
    }catch(InterruptedException e){Thread.currentThread().interrupt();failed(w);}catch(Exception e){failed(w);}return true;}
    private Work claim(){return tx.execute(s->{
        var parents=db.queryForList("""
            SELECT s.* FROM payment_schema.referral_refund_sequence s JOIN LATERAL (
              SELECT a.* FROM payment_schema.referral_refund_allocation a WHERE a.checkout_id=s.checkout_id AND a.state<>'COMPLETE'
              ORDER BY a.created_at,a.chef_order_id LIMIT 1) a ON true
            JOIN payment_schema.refund r ON r.chef_sub_order_id=a.chef_order_id
            WHERE a.state='WAITING' AND a.next_attempt_at<=now() AND (a.lease_until IS NULL OR a.lease_until<=now())
              AND (a.gateway_paise=0 OR r.status='SUCCESS')
            ORDER BY s.checkout_id LIMIT 1 FOR UPDATE OF s SKIP LOCKED
            """);if(parents.isEmpty())return null;var parent=parents.getFirst();UUID checkout=(UUID)parent.get("checkout_id");
        var rows=db.queryForList("SELECT a.*,r.status AS provider_state FROM payment_schema.referral_refund_allocation a JOIN payment_schema.refund r ON r.chef_sub_order_id=a.chef_order_id WHERE a.checkout_id=? AND a.state<>'COMPLETE' ORDER BY a.created_at,a.chef_order_id LIMIT 1 FOR UPDATE OF a",checkout);
        if(rows.isEmpty())return null;var r=rows.getFirst();if(!"WAITING".equals(r.get("state")) || ((Timestamp)r.get("next_attempt_at")).toInstant().isAfter(Instant.now()) || (r.get("lease_until")!=null && ((Timestamp)r.get("lease_until")).toInstant().isAfter(Instant.now())))return null;
        UUID order=(UUID)r.get("chef_order_id");if(((Number)r.get("attempts")).intValue()>=40){db.update("UPDATE payment_schema.referral_refund_allocation SET state='REVIEW',lease_id=NULL,lease_until=NULL,last_code='ATTEMPTS_EXHAUSTED' WHERE chef_order_id=?",order);return null;}
        if(number(r,"gateway_paise")>0 && !"SUCCESS".equals(r.get("provider_state")))return null;
        JsonNode envelope=r.get("operation_envelope")==null?null:parse(r.get("operation_envelope").toString());
        if(envelope==null){
            var payload=json.createObjectNode().put("checkoutId",checkout.toString()).put("version",((Number)parent.get("version")).intValue()+1).put("cumulativeWalletPaise",Long.toString(Math.addExact(number(parent,"wallet_refunded_paise"),number(r,"wallet_paise")))).put("cumulativeDiscountPaise",Long.toString(Math.addExact(number(parent,"discount_refunded_paise"),number(r,"discount_paise")))).put("evidenceRef","finance-refund/"+order);
            envelope=json.createObjectNode().put("operationId",stable(order,"operation").toString()).put("operationType","checkout.refund").set("payload",payload);
        }
        UUID lease=UUID.randomUUID();db.update("UPDATE payment_schema.referral_refund_allocation SET operation_envelope=?::jsonb,lease_id=?,lease_until=now()+interval '60 seconds',attempts=attempts+1 WHERE chef_order_id=?",envelope.toString(),lease,order);return new Work(order,checkout,lease,envelope.toString());
    });}
    private void finish(Work w,JsonNode p){
        db.queryForMap("SELECT * FROM payment_schema.referral_refund_sequence WHERE checkout_id=? FOR UPDATE",w.checkout());
        var rows=db.queryForList("SELECT * FROM payment_schema.referral_refund_allocation WHERE chef_order_id=? AND lease_id=? AND lease_until>now() FOR UPDATE",w.order(),w.lease());if(rows.isEmpty())return;var a=rows.getFirst();var refund=db.queryForMap("SELECT * FROM payment_schema.refund WHERE chef_sub_order_id=? FOR UPDATE",w.order());
        if(number(a,"gateway_paise")>0 && !"SUCCESS".equals(refund.get("status")))throw new IllegalStateException("GATEWAY_REFUND_NOT_CONFIRMED");
        Instant now=Instant.now();var lines=new ArrayList<LedgerJournal.Line>();lines.add(LedgerJournal.Line.debit("CUSTOMER_FUNDS",BigDecimal.valueOf(number(a,"gross_paise"),2),null));credit(lines,"GATEWAY_CLEARING",number(a,"gateway_paise"));credit(lines,"REFERRAL_CHECKOUT_CLEARING",number(a,"wallet_paise"));credit(lines,"REFERRAL_MARKETING_EXPENSE",number(a,"discount_paise"));
        var posted=ledger.post(new LedgerJournal.Entry("referral-refund/"+w.order(),stable(w.order(),"ledger"),"referral-finance","REFERRAL_SPLIT_REFUND",w.checkout(),w.order(),"INR",now,"finance-refund/"+w.order(),null,"SERVICE","referral-refund-worker",lines));
        if(posted.outcome()==LedgerJournal.Outcome.CONFLICT)throw new IllegalStateException("REFERRAL_REFUND_LEDGER_CONFLICT");
        if(number(a,"gateway_paise")==0)db.update("UPDATE payment_schema.refund SET status='SUCCESS',provider_status='NO_EXTERNAL_REFUND',processed_at=?,updated_at=? WHERE id=?",Timestamp.from(now),Timestamp.from(now),refund.get("id"));
        db.update("UPDATE payment_schema.referral_refund_allocation SET state='COMPLETE',completed_at=?,lease_id=NULL,lease_until=NULL,last_code=NULL WHERE chef_order_id=?",Timestamp.from(now),w.order());
        db.update("UPDATE payment_schema.referral_refund_sequence SET version=?,wallet_refunded_paise=?,discount_refunded_paise=? WHERE checkout_id=?",p.path("version").intValue(),Long.parseLong(p.path("cumulativeWalletPaise").asText()),Long.parseLong(p.path("cumulativeDiscountPaise").asText()),w.checkout());
        UUID event=stable(w.order(),"customer-success");var data=json.createObjectNode().put("refundId",refund.get("id").toString()).put("checkoutId",w.checkout().toString()).put("chefSubOrderId",w.order().toString()).put("customerIdentityId",refund.get("customer_identity_id").toString()).put("refundReference",refund.get("refund_ref").toString()).put("refundAmount",BigDecimal.valueOf(number(a,"gross_paise"),2)).put("currency","INR").put("reason",refund.get("reason").toString()).put("status","SUCCESS").put("provider",refund.get("provider").toString()).put("providerStatus","ALL_TENDERS_RESTORED").put("updatedAt",now.toString());
        if(refund.get("provider_refund_id")!=null)data.put("providerRefundId",refund.get("provider_refund_id").toString());
        var body=json.createObjectNode().put("eventId",event.toString()).put("eventType","REFUND_STATUS_CHANGED").put("eventVersion","1.0").put("occurredAt",now.toString()).put("correlationId",w.checkout().toString()).put("causationId",a.get("request_event_id").toString()).put("source","integration-service").put("subject",w.order().toString()).set("data",data);
        db.update("INSERT INTO payment_schema.refund_status_outbox(id,event_key,aggregate_id,event_type,event_version,correlation_id,causation_id,subject,payload,status,attempt_count,next_attempt_at,created_at,updated_at) VALUES (?,?,?,'REFUND_STATUS_CHANGED','1.0',?,?,?,?::jsonb,'PENDING',0,now(),now(),now())",event,"referral-refund/"+w.order()+"/complete",w.order(),w.checkout(),a.get("request_event_id"),w.order(),body.toString());
        db.update("UPDATE payment_schema.referral_finance_binding SET next_observation_at=now() WHERE chef_order_id=?",w.order());
    }
    private void failed(Work w){db.update("UPDATE payment_schema.referral_refund_allocation SET state=CASE WHEN attempts>=40 THEN 'REVIEW' ELSE state END,lease_id=NULL,lease_until=NULL,next_attempt_at=now()+interval '5 seconds',last_code='TENDER_RESTORATION_UNCONFIRMED' WHERE chef_order_id=? AND lease_id=? AND lease_until>now()",w.order(),w.lease());}
    private static long number(Map<String,Object> row,String field){return ((Number)row.get(field)).longValue();}
    private static void credit(List<LedgerJournal.Line> lines,String account,long amount){if(amount>0)lines.add(LedgerJournal.Line.credit(account,BigDecimal.valueOf(amount,2),null));}
    private JsonNode parse(String value){try{return json.readTree(value);}catch(Exception e){throw new IllegalStateException("Invalid refund evidence",e);}}
    private static UUID stable(UUID order,String kind){return UUID.nameUUIDFromBytes(("referral-refund/"+order+"/"+kind).getBytes(StandardCharsets.UTF_8));}
}
