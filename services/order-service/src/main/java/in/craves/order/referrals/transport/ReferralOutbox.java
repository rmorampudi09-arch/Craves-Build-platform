package in.craves.order.referrals.transport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Source-owned, durable transport. Receiving HTTP 202 is not evidence of reward processing. */
public final class ReferralOutbox {
    public record Work(UUID eventId,UUID lease,String envelope,int attempts) {}
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    public ReferralOutbox(JdbcTemplate db,ObjectMapper json,TransactionTemplate tx){this.db=db;this.json=json;this.tx=tx;}
    public UUID enqueue(String key,String type,UUID aggregate,Instant occurred,JsonNode payload){
        if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("REFERRAL_SOURCE_TRANSACTION_REQUIRED");
        if(key==null || key.isBlank() || key.length()>200 || aggregate==null || occurred==null || !payload.isObject())throw new IllegalArgumentException("Invalid source event");
        String content=write(json.createObjectNode().put("eventType",type).put("aggregateId",aggregate.toString()).put("occurredAt",occurred.toString()).set("payload",payload));
        String hash=sha(content);
        db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},"referral-source/"+key);
        var previous=db.queryForList("SELECT event_id,content_hash FROM order_schema.referral_source_outbox WHERE event_key=?",key);
        if(!previous.isEmpty()){
            if(!hash.equals(previous.getFirst().get("content_hash")))throw new IllegalStateException("REFERRAL_SOURCE_CONTENT_CONFLICT");
            return (UUID)previous.getFirst().get("event_id");
        }
        UUID id=UUID.randomUUID();
        var envelope=json.createObjectNode().put("eventId",id.toString()).put("eventType",type).put("aggregateId",aggregate.toString()).put("occurredAt",occurred.toString());
        envelope.set("payload",payload);
        String body=write(envelope);
        if(body.getBytes(StandardCharsets.UTF_8).length>131072)throw new IllegalArgumentException("Referral event exceeds transport limit");
        db.update("INSERT INTO order_schema.referral_source_outbox(event_id,event_key,aggregate_id,content_hash,envelope) VALUES (?,?,?,?,?)",id,key,aggregate,hash,body);
        return id;
    }
    public Work claim(){return tx.execute(s->{
        UUID lease=UUID.randomUUID();
        var rows=db.query("WITH due AS (SELECT event_id FROM order_schema.referral_source_outbox WHERE attempts<40 AND ((status='PENDING' AND next_attempt_at<=now()) OR (status='SENDING' AND lease_until<=now())) ORDER BY next_attempt_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE order_schema.referral_source_outbox o SET status='SENDING',lease_id=?,lease_until=now()+interval '60 seconds',attempts=attempts+1 FROM due WHERE o.event_id=due.event_id RETURNING o.event_id,o.envelope,o.attempts",(rs,n)->new Work(rs.getObject(1,UUID.class),lease,rs.getString(2),rs.getInt(3)),lease);
        db.update("UPDATE order_schema.referral_source_outbox SET status='DEAD',last_code='ATTEMPTS_EXHAUSTED',lease_id=NULL,lease_until=NULL WHERE status='SENDING' AND attempts>=40 AND lease_until<=now()");
        return rows.isEmpty()?null:rows.getFirst();
    });}
    public void acknowledge(Work work,JsonNode reply){
        if(!reply.path("accepted").isBoolean() || !reply.path("accepted").booleanValue() || !work.eventId().toString().equals(reply.path("eventId").asText()) || !Set.of("RECEIVED","APPLIED").contains(reply.path("status").asText()))throw new IllegalStateException("REFERRAL_RECEIPT_NOT_ACCEPTED");
        db.update("UPDATE order_schema.referral_source_outbox SET status='RECEIVED',last_code='DURABLE_RECEIPT',lease_id=NULL,lease_until=NULL WHERE event_id=? AND status='SENDING' AND lease_id=? AND lease_until>now()",work.eventId(),work.lease());
    }
    public void failed(Work work,boolean permanent){
        long seconds=Math.min(3600,10L*(1L<<Math.min(8,work.attempts())))+Math.floorMod(work.eventId().hashCode(),17);
        db.update("UPDATE order_schema.referral_source_outbox SET status=?,last_code=?,next_attempt_at=?,lease_id=NULL,lease_until=NULL WHERE event_id=? AND status='SENDING' AND lease_id=? AND lease_until>now()",permanent || work.attempts()>=40?"DEAD":"PENDING",permanent?"SOURCE_REJECTED":"TRANSPORT_UNCONFIRMED",Timestamp.from(Instant.now().plusSeconds(seconds)),work.eventId(),work.lease());
    }
    private String write(JsonNode node){try{return json.writeValueAsString(node);}catch(Exception e){throw new IllegalArgumentException("Invalid referral event",e);}}
    private static String sha(String body){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
