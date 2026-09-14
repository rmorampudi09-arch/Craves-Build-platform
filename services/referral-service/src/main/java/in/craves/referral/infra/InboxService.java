package in.craves.referral.infra;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.ReferralProblem;
import in.craves.referral.ReferralSettings;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import static in.craves.referral.ReferralProblem.require;
import static in.craves.referral.infra.Store.*;

@Service
public class InboxService {
    private final Store db;
    private final SourceEventRouter router;
    private final ReferralSettings settings;
    private final Clock clock;
    public InboxService(Store db,SourceEventRouter router,ReferralSettings settings,Clock clock) {
        this.db=db; this.router=router; this.settings=settings; this.clock=clock;
    }
    public Map<String,Object> receive(String source,JsonNode envelope) {
        settings.requireEnabled();
        Json.fields(envelope,"eventId","eventType","aggregateId","occurredAt","payload");
        UUID id=Json.uuid(envelope,"eventId"), aggregate=Json.uuid(envelope,"aggregateId");
        String type=Json.text(envelope,"eventType",50), hash=Json.hash(envelope);
        Instant occurred=Json.instant(envelope,"occurredAt");
        require(!occurred.isAfter(clock.instant().plusSeconds(60)),422,"FUTURE_SOURCE_EVENT");
        SourceEventRouter.validate(source,type,aggregate,envelope.get("payload"));
        return db.tx(() -> {
            db.update("INSERT INTO referral_schema.inbox(source,event_id,aggregate_id,event_type,payload_hash,payload) VALUES (?,?,?,?,?,?::jsonb) ON CONFLICT(source,event_id) DO NOTHING",
                source,id,aggregate,type,hash,Json.write(envelope));
            Map<String,Object> row=db.one("SELECT payload_hash,status FROM referral_schema.inbox WHERE source=? AND event_id=?",source,id);
            require(hash.equals(row.get("payload_hash")),409,"SOURCE_EVENT_ID_CONFLICT");
            return Map.of("eventId",id.toString(),"status",row.get("status"),"accepted",true);
        });
    }
    public boolean applyOne() {
        if(!settings.enabled() || !settings.workersEnabled()) return false;
        String[] source={null}; UUID[] event={null}; int[] attempts={0};
        try {
            return db.tx(() -> {
                List<Map<String,Object>> due=db.rows("SELECT * FROM referral_schema.inbox WHERE status='RECEIVED' AND next_attempt_at<=? ORDER BY next_attempt_at,received_at LIMIT 1 FOR UPDATE SKIP LOCKED",time(clock.instant()));
                if(due.isEmpty()) return false;
                Map<String,Object> row=due.getFirst(); source[0]=row.get("source").toString(); event[0]=uuid(row,"event_id"); attempts[0]=(int)number(row,"attempts");
                JsonNode envelope=Json.parse(row.get("payload").toString()); UUID aggregate=uuid(row,"aggregate_id");
                router.apply(source[0],row.get("event_type").toString(),aggregate,envelope.get("payload"));
                db.update("UPDATE referral_schema.inbox SET status='APPLIED',applied_at=?,attempts=attempts+1,last_error=NULL WHERE source=? AND event_id=?",time(clock.instant()),source[0],event[0]);
                db.update("UPDATE referral_schema.worker_schedule SET next_at=? WHERE aggregate_id=?",time(clock.instant()),aggregate);
                return true;
            });
        } catch(RuntimeException ex) {
            if(event[0]==null) throw ex;
            String code=ex instanceof ReferralProblem problem?problem.getMessage():"DATABASE_OR_WORKER_RETRY";
            int count=attempts[0]+1;
            boolean permanent=ex instanceof ReferralProblem problem && (problem.status()==422 || problem.status()==403);
            long delay=Math.min(3600,10L*(1L<<Math.min(8,count)))+Math.floorMod(event[0].hashCode(),17);
            db.update("UPDATE referral_schema.inbox SET status=?,attempts=attempts+1,next_attempt_at=?,last_error=? WHERE source=? AND event_id=? AND status='RECEIVED' AND attempts=?",
                permanent || count>=12?"DEAD":"RECEIVED",time(clock.instant().plusSeconds(delay)),code,source[0],event[0],attempts[0]);
            return true;
        }
    }
    public void replay(UUID actor,String source,UUID event,String evidence) {
        settings.requireEnabled();
        require(evidence!=null && !evidence.isBlank() && evidence.length()<=180,422,"REPLAY_EVIDENCE_REQUIRED");
        db.tx(() -> {
            Map<String,Object> row=db.one("SELECT * FROM referral_schema.inbox WHERE source=? AND event_id=? FOR UPDATE",source,event);
            require(row.get("status").equals("DEAD"),409,"ONLY_DEAD_EVENTS_CAN_BE_REPLAYED");
            db.audit(actor.toString(),"IMMUTABLE_INBOX_REPLAY",source+":"+event,Map.of("priorAttempts",number(row,"attempts"),"evidenceRef",evidence));
            db.update("UPDATE referral_schema.inbox SET status='RECEIVED',attempts=0,next_attempt_at=?,last_error=NULL WHERE source=? AND event_id=?",time(clock.instant()),source,event);
            return null;
        });
    }
}
