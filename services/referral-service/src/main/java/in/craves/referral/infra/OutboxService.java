package in.craves.referral.infra;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralSettings;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

@Service
public class OutboxService {
    private final Store db;
    private final ReferralSettings settings;
    private final Clock clock;
    public OutboxService(Store db,ReferralSettings settings,Clock clock) { this.db=db; this.settings=settings; this.clock=clock; }
    public JsonNode claim(String source,JsonNode body) {
        settings.requireEnabled(); require(source.equals("finance"),403,"OUTBOX_CONSUMER_FORBIDDEN");
        Json.fields(body,"claimId","limit"); UUID claim=Json.uuid(body,"claimId"); int limit=Json.integer(body,"limit",1,100); String hash=Json.hash(body);
        return db.tx(() -> {
            db.jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"outbox-claim:"+claim);
            List<Map<String,Object>> existing=db.rows("SELECT operation_type,payload_hash,result FROM referral_schema.operation_receipt WHERE source='finance' AND operation_id=?",claim);
            if(!existing.isEmpty()) {
                Map<String,Object> row=existing.getFirst();
                require(row.get("operation_type").equals("outbox.claim") && hash.equals(row.get("payload_hash")),409,"CLAIM_ID_CONFLICT");
                JsonNode result=Json.parse(row.get("result").toString());
                for(JsonNode item:result.get("items")) {
                    if(!settings.withdrawalsEnabled())
                        require(!item.get("eventType").asText().equals("referral.payout.requested"),503,"CASHOUT_DISABLED");
                    Map<String,Object> live=db.one("SELECT status,lease_id,lease_until FROM referral_schema.outbox WHERE id=? FOR SHARE",UUID.fromString(item.get("id").asText()));
                    // A cached claim is not a perpetual permission to execute its events.
                    require(live.get("status").equals("LEASED")
                        && UUID.fromString(item.get("leaseId").asText()).equals(uuid(live,"lease_id"))
                        && instant(live,"lease_until")!=null && instant(live,"lease_until").isAfter(clock.instant()),
                        409,"OUTBOX_CLAIM_NO_LONGER_VALID");
                }
                return result;
            }
            db.update("UPDATE referral_schema.outbox SET status='DEAD' WHERE status='LEASED' AND lease_until<=? AND attempts>=12",time(clock.instant()));
            List<Map<String,Object>> rows=db.rows("SELECT * FROM referral_schema.outbox WHERE (status='PENDING' OR (status='LEASED' AND lease_until<=?)) AND attempts<12 AND (event_type<>'referral.payout.requested' OR ?) ORDER BY created_at,id LIMIT ? FOR UPDATE SKIP LOCKED",
                time(clock.instant()),settings.withdrawalsEnabled(),limit);
            List<Map<String,Object>> items=new ArrayList<>();
            for(Map<String,Object> row:rows) {
                UUID id=uuid(row,"id"), lease=UUID.randomUUID(); var until=clock.instant().plusSeconds(120);
                db.update("UPDATE referral_schema.outbox SET status='LEASED',lease_id=?,lease_until=?,attempts=attempts+1 WHERE id=?",lease,time(until),id);
                items.add(Map.of("id",id.toString(),"eventType",row.get("event_type"),"payload",Json.parse(row.get("payload").toString()),"leaseId",lease.toString(),"leaseUntil",until.toString()));
            }
            JsonNode result=Json.MAPPER.valueToTree(Map.of("items",items));
            db.update("INSERT INTO referral_schema.operation_receipt(source,operation_id,operation_type,payload_hash,result) VALUES ('finance',?,'outbox.claim',?,?::jsonb)",claim,hash,Json.write(result));
            return result;
        });
    }
    public void acknowledge(String source,JsonNode body) {
        settings.requireEnabled(); require(source.equals("finance"),403,"OUTBOX_CONSUMER_FORBIDDEN");
        Json.fields(body,"eventId","leaseId"); UUID id=Json.uuid(body,"eventId"), lease=Json.uuid(body,"leaseId");
        db.tx(() -> {
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.outbox WHERE id=? FOR UPDATE",id);
            require(lease.equals(uuid(row,"lease_id")),409,"OUTBOX_LEASE_CONFLICT");
            if(row.get("status").equals("ACKED")) return null;
            require(row.get("status").equals("LEASED") && instant(row,"lease_until").isAfter(clock.instant()),409,"OUTBOX_LEASE_EXPIRED");
            db.update("UPDATE referral_schema.outbox SET status='ACKED',acknowledged_at=? WHERE id=?",time(clock.instant()),id);
            return null;
        });
    }
    public void replay(UUID actor,UUID id,String evidence) {
        settings.requireEnabled(); require(evidence!=null && !evidence.isBlank() && evidence.length()<=180,422,"REPLAY_EVIDENCE_REQUIRED");
        db.tx(() -> {
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.outbox WHERE id=? FOR UPDATE",id);
            require(row.get("status").equals("DEAD"),409,"ONLY_DEAD_OUTBOX_CAN_BE_REPLAYED");
            db.audit(actor.toString(),"IMMUTABLE_OUTBOX_REPLAY",id.toString(),Map.of("priorAttempts",number(row,"attempts"),"evidenceRef",evidence));
            db.update("UPDATE referral_schema.outbox SET status='PENDING',attempts=0,lease_id=NULL,lease_until=NULL WHERE id=?",id);
            return null;
        });
    }
}
