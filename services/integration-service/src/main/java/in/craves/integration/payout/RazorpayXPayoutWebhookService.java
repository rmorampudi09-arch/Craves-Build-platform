package in.craves.integration.payout;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** A verified webhook identifies a payout; the worker still fetches its authoritative API status. */
@Service
public class RazorpayXPayoutWebhookService {
    private final JdbcTemplate jdbc;private final ObjectMapper json;private final String secret;
    public RazorpayXPayoutWebhookService(JdbcTemplate jdbc,ObjectMapper json,@Value("${craves.razorpayx.webhook-secret:}") String secret) {
        this.jdbc=jdbc;this.json=json;this.secret=secret;
    }
    @Transactional
    public String accept(byte[] body,String signature,String eventId) {
        verifySignature(body,signature,secret);
        if(eventId==null || !eventId.matches("[A-Za-z0-9_-]{1,240}")) throw error(HttpStatus.BAD_REQUEST,"Invalid provider event identifier");
        try {
            var root=json.readTree(body);String type=root.path("event").asText();
            if(!Set.of("payout.processed","payout.reversed","payout.failed","payout.updated","payout.pending","payout.queued","payout.initiated","payout.rejected").contains(type)) return "IGNORED_EVENT";
            var entity=root.path("payload").path("payout").path("entity");String reference=entity.path("reference_id").asText();
            if(!reference.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) return "IGNORED_UNRELATED_PAYOUT";
            UUID instruction=UUID.fromString(reference);
            String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
            var prior=jdbc.query("SELECT payload_hash FROM payment_schema.finance_payout_webhook_inbox WHERE event_id=?",(rs,n)->rs.getString(1),eventId);
            if(!prior.isEmpty()) {if(!prior.getFirst().equals(hash)) throw error(HttpStatus.CONFLICT,"Provider event content changed");return "REPLAY";}
            var rows=jdbc.queryForList("SELECT i.*,b.fund_account_id FROM payment_schema.finance_payout_instruction i JOIN payment_schema.finance_beneficiary_version b ON b.id=i.beneficiary_id WHERE i.payout_channel='RAZORPAYX' AND i.id=? FOR UPDATE OF i",instruction);
            if(rows.isEmpty()) return "IGNORED_UNRELATED_PAYOUT";
            var current=rows.getFirst();UUID chef=(UUID)current.get("chef_identity_id");
            var context=new RazorpayXPayoutClient.Instruction(instruction,current.get("fund_account_id").toString(),current.get("amount").toString(),(String)current.get("provider_id"));
            var receipt=RazorpayXPayoutClient.verify(context,entity);
            if(jdbc.update("INSERT INTO payment_schema.finance_payout_webhook_inbox(event_id,payload_hash,instruction_id,provider_id,event_type) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",eventId,hash,instruction,receipt.payoutId(),type)==0) {
                String existing=jdbc.queryForObject("SELECT payload_hash FROM payment_schema.finance_payout_webhook_inbox WHERE event_id=?",String.class,eventId);
                if(!hash.equals(existing)) throw error(HttpStatus.CONFLICT,"Provider event content changed");return "REPLAY";
            }
            String state=current.get("status").toString();
            boolean terminalConflict=("PAID".equals(state) && Set.of("reversed","failed","cancelled","rejected").contains(receipt.status()))
                || (Set.of("FAILED","REVERSED").contains(state) && "processed".equals(receipt.status()));
            if(terminalConflict) {
                jdbc.update("UPDATE payment_schema.finance_chef_payout_control SET on_hold=true,hold_reason='Late terminal payout change: clearing correction review required',updated_at=now() WHERE chef_identity_id=?",chef);
                jdbc.update("UPDATE payment_schema.finance_payout_instruction SET last_error='LATE_TERMINAL_CHANGE_REVIEW_REQUIRED',updated_at=now() WHERE id=?",instruction);
                jdbc.update("INSERT INTO payment_schema.finance_payout_audit(id,instruction_id,chef_identity_id,action,actor,evidence_reference) VALUES (?,?,?,'LATE_TERMINAL_CHANGE','razorpayx-webhook',?)",UUID.randomUUID(),instruction,chef,"event/"+eventId);
                return "TERMINAL_HISTORY_HELD_FOR_REVIEW";
            }
            // Delayed queued/processing events cannot regress an already completed transfer.
            if(Set.of("PAID","FAILED","REVERSED").contains(state)) return "TERMINAL_HISTORY_PRESERVED";
            jdbc.update("UPDATE payment_schema.finance_payout_instruction SET provider_id=?,status='PROCESSING',provider_status=?,lease_id=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE id=?",receipt.payoutId(),receipt.status(),instruction);
            return "RECONCILIATION_QUEUED";
        } catch(ResponseStatusException known) {throw known;}
        catch(IllegalArgumentException malformed) {throw error(HttpStatus.BAD_REQUEST,"Invalid payout webhook context");}
        catch(org.springframework.dao.DataAccessException database) {throw database;}
        catch(Exception invalid) {throw error(HttpStatus.BAD_REQUEST,"Invalid or mismatched payout webhook");}
    }
    static void verifySignature(byte[] body,String signature,String secret) {
        if(secret==null || secret.isBlank()) throw error(HttpStatus.SERVICE_UNAVAILABLE,"Payout webhook verification is not configured");
        if(body==null || body.length>65536 || signature==null || !signature.matches("[0-9a-fA-F]{64}")) throw error(HttpStatus.UNAUTHORIZED,"Invalid payout webhook signature");
        try {
            Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
            if(!MessageDigest.isEqual(mac.doFinal(body),HexFormat.of().parseHex(signature))) throw error(HttpStatus.UNAUTHORIZED,"Invalid payout webhook signature");
        } catch(ResponseStatusException known) {throw known;}
        catch(Exception invalid) {throw error(HttpStatus.UNAUTHORIZED,"Invalid payout webhook signature");}
    }
    private static ResponseStatusException error(HttpStatus status,String message) {return new ResponseStatusException(status,message);}
}
