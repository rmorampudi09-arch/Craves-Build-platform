package in.craves.integration.referrals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.source.FinancialJson;
import in.craves.integration.referrals.transport.ReferralSourceClient;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Finance takes durable ownership before ACK; economic effects are separately retried by original ID. */
@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralFinanceConsumer {
    private final JdbcTemplate db;private final ObjectMapper json;private final ReferralSourceClient client;
    private final TransactionTemplate tx;private final ReferralJournalMirror mirror;
    public ReferralFinanceConsumer(JdbcTemplate db,ObjectMapper json,ReferralSourceClient client,PlatformTransactionManager manager,ReferralJournalMirror mirror){this.db=db;this.json=json;this.client=client;this.tx=new TransactionTemplate(manager);this.mirror=mirror;}
    @Scheduled(scheduler="referralTaskScheduler",fixedDelayString="${CRAVES_REFERRAL_FINANCE_CONSUMER_POLL_MS:5000}")
    public void receive(){
        try{
            var request=json.createObjectNode().put("claimId",UUID.randomUUID().toString()).put("limit",20);
            var reply=client.send(ReferralSourceClient.Endpoint.CLAIM,bytes(request));
            if(reply.status()!=200)return;
            var items=json.readTree(reply.body()).path("items");
            if(!items.isArray() || items.size()>20)throw new IllegalArgumentException("Invalid referral claim");
            for(var item:items){
                UUID event=UUID.fromString(item.path("id").asText());UUID lease=UUID.fromString(item.path("leaseId").asText());
                if(!Instant.parse(item.path("leaseUntil").asText()).isAfter(Instant.now()))continue;
                persist(event,item.path("eventType").asText(),item.path("payload"));
                var ack=json.createObjectNode().put("eventId",event.toString()).put("leaseId",lease.toString());
                // An uncertain ACK is retried by the producer lease; the persisted inbox prevents a second effect.
                client.send(ReferralSourceClient.Endpoint.ACK,bytes(ack));
            }
        }catch(InterruptedException e){Thread.currentThread().interrupt();}
        catch(Exception e){/* No payload or credential logging. Original producer events remain durable. */}
    }
    public void persist(UUID event,String type,JsonNode payload){
        if(type==null || !type.matches("referral\\.[a-z.]{1,45}") || !payload.isObject())throw new IllegalArgumentException("Invalid referral fact");
        String hash=FinancialJson.hash(json.createObjectNode().put("eventType",type).set("payload",payload),json);
        tx.executeWithoutResult(s->{
            db.update("INSERT INTO payment_schema.referral_consumer_inbox(event_id,event_type,payload,payload_hash) VALUES (?,?,?::jsonb,?) ON CONFLICT(event_id) DO NOTHING",event,type,payload.toString(),hash);
            String prior=db.queryForObject("SELECT payload_hash FROM payment_schema.referral_consumer_inbox WHERE event_id=?",String.class,event);
            if(!hash.equals(prior))throw new IllegalStateException("REFERRAL_CONSUMER_EVENT_CONFLICT");
        });
    }
    @Scheduled(scheduler="referralTaskScheduler",fixedDelayString="${CRAVES_REFERRAL_FINANCE_APPLY_POLL_MS:1000}")
    public void process(){for(int n=0;n<20;n++)if(!applyOne())return;}
    public boolean applyOne(){
        UUID[] event={null};int[] attempts={0};
        try{return Boolean.TRUE.equals(tx.execute(s->{
            var rows=db.queryForList("SELECT * FROM payment_schema.referral_consumer_inbox WHERE status='RECEIVED' AND next_attempt_at<=now() ORDER BY next_attempt_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED");
            if(rows.isEmpty())return false;var row=rows.getFirst();event[0]=(UUID)row.get("event_id");attempts[0]=((Number)row.get("attempts")).intValue();
            JsonNode body=parse(row.get("payload").toString());String type=row.get("event_type").toString();
            switch(type){
                case "referral.order.bound" -> bind(body);
                case "referral.journal.appended" -> mirror.apply(event[0],body);
                case "referral.finance.refresh.requested" -> db.update("UPDATE payment_schema.referral_finance_binding SET next_observation_at=now() WHERE checkout_id=?",UUID.fromString(body.path("checkoutId").asText()));
                case "referral.payout.requested" -> payout(event[0],body);
                case "referral.reward.pending","referral.reward.credited","referral.reward.reversed","referral.funding.review" -> { /* Durable operator/notification facts; accounting uses journal events only. */ }
                default -> throw new IllegalArgumentException("REFERRAL_EVENT_TYPE_UNSUPPORTED");
            }
            db.update("UPDATE payment_schema.referral_consumer_inbox SET status='APPLIED',attempts=attempts+1,applied_at=now(),last_code=NULL WHERE event_id=?",event[0]);return true;
        }));}catch(RuntimeException e){
            if(event[0]==null)throw e;int next=attempts[0]+1;
            db.update("UPDATE payment_schema.referral_consumer_inbox SET status=?,attempts=attempts+1,next_attempt_at=now()+(?*interval '1 second'),last_code='REFERRAL_FINANCE_PROCESSING_BLOCKED' WHERE event_id=? AND status='RECEIVED' AND attempts=?",next>=40?"DEAD":"RECEIVED",Math.min(3600,10*(1L<<Math.min(next,8))),event[0],attempts[0]);return true;
        }
    }
    private void bind(JsonNode body){
        UUID order=UUID.fromString(body.path("chefOrderId").asText()),checkout=UUID.fromString(body.path("checkoutId").asText());String hash=body.path("sourceSnapshotHash").asText();
        if(!hash.matches("[0-9a-f]{64}") || !Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.finance_issued_snapshot WHERE chef_order_id=? AND checkout_id=? AND snapshot_hash=?)",Boolean.class,order,checkout,hash)))throw new IllegalStateException("REFERRAL_ISSUED_SNAPSHOT_MISMATCH");
        db.update("INSERT INTO payment_schema.referral_finance_binding(chef_order_id,checkout_id,source_hash) VALUES (?,?,?) ON CONFLICT(chef_order_id) DO NOTHING",order,checkout,hash);
        if(!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.referral_finance_binding WHERE chef_order_id=? AND checkout_id=? AND source_hash=?)",Boolean.class,order,checkout,hash)))throw new IllegalStateException("REFERRAL_BINDING_CONFLICT");
    }
    private void payout(UUID event,JsonNode body){
        UUID attempt=UUID.fromString(body.path("attemptId").asText()),reservation=UUID.fromString(body.path("reservationId").asText()),user=UUID.fromString(body.path("beneficiaryUserId").asText());
        if(!"INR".equals(body.path("currency").asText()))throw new IllegalArgumentException("INR required");
        // A recorded instruction does not mean paid. No replacement transfer or existing chef payout is created.
        db.update("INSERT INTO payment_schema.referral_payout_instruction(attempt_id,reservation_id,user_id,payload,source_event_id) VALUES (?,?,?,?::jsonb,?) ON CONFLICT(attempt_id) DO NOTHING",attempt,reservation,user,body.toString(),event);
        String previous=db.queryForObject("SELECT payload::text FROM payment_schema.referral_payout_instruction WHERE attempt_id=?",String.class,attempt);
        if(!FinancialJson.hash(parse(previous),json).equals(FinancialJson.hash(body,json)))throw new IllegalStateException("REFERRAL_PAYOUT_ATTEMPT_CONFLICT");
    }
    private JsonNode parse(String body){try{return json.readTree(body);}catch(Exception e){throw new IllegalArgumentException("Invalid stored referral evidence",e);}}
    private static byte[] bytes(JsonNode value){return value.toString().getBytes(StandardCharsets.UTF_8);}
}
