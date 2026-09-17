package in.craves.integration.referrals;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.security.CravesPrincipal;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
/** Requeues original immutable work after the operator repairs its dependency; never creates a transfer. */
@RestController
@RequestMapping("/api/v1/admin/finance/referrals/operations")
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralOperationsController {
    public record Retry(String reason,String evidenceRef) {}
    private final JdbcTemplate db;private final ObjectMapper json;private final TransactionTemplate tx;
    public ReferralOperationsController(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager){this.db=db;this.json=json;this.tx=new TransactionTemplate(manager);}
    @GetMapping public Map<String,Object> status(@AuthenticationPrincipal CravesPrincipal actor){FinancePolicyService.reader(actor);return Map.of(
        "sourceOutbox",db.queryForList("SELECT status,count(*) FROM payment_schema.referral_source_outbox GROUP BY status"),
        "consumerInbox",db.queryForList("SELECT status,count(*) FROM payment_schema.referral_consumer_inbox GROUP BY status"),
        "checkoutFunding",db.queryForList("SELECT state,create_state,count(*) FROM payment_schema.referral_checkout_funding GROUP BY state,create_state"),
        "splitRefunds",db.queryForList("SELECT state,count(*) FROM payment_schema.referral_refund_allocation GROUP BY state"),
        "payouts",db.queryForList("SELECT state,count(*) FROM payment_schema.referral_payout_execution GROUP BY state"));}
    @PostMapping("/{kind}/{id}/retry") public Map<String,String> retry(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable String kind,@PathVariable UUID id,@RequestBody Retry request){
        FinancePolicyService.operator(actor);if(request==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Recovery evidence is required");String reason=FinancePolicyService.reason(request.reason());
        if(request.evidenceRef()==null || !request.evidenceRef().matches("[A-Za-z0-9][A-Za-z0-9._:/-]{5,179}"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Evidence reference required");
        String table,column,condition,target;
        switch(kind){case "checkouts"->{table="referral_checkout_funding";column="checkout_id";condition="state='REVIEW' AND (lease_until IS NULL OR lease_until<=now())";target="state='RESERVED',lease_id=NULL,lease_until=NULL";}
            case "refunds"->{table="referral_refund_allocation";column="chef_order_id";condition="state='REVIEW' AND (lease_until IS NULL OR lease_until<=now())";target="state='WAITING',lease_id=NULL,lease_until=NULL";}
            case "cancellations"->{table="referral_checkout_cancellation";column="checkout_id";condition="completed_at IS NULL AND attempts>=40";target="completed_at=NULL";}
            case "inbox"->{table="referral_consumer_inbox";column="event_id";condition="status='DEAD'";target="status='RECEIVED'";}
            case "outbox"->{table="referral_source_outbox";column="event_id";condition="status='DEAD'";target="status='PENDING',lease_id=NULL,lease_until=NULL";}
            default->throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported recovery kind");}
        return tx.execute(s->{var rows=db.queryForList("SELECT attempts FROM payment_schema."+table+" WHERE "+column+"=? AND "+condition+" FOR UPDATE",id);
            if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Work is not eligible for reviewed retry");
            db.update("INSERT INTO payment_schema.referral_operator_audit(id,action,target_id,actor_id,reason,evidence_ref,detail) VALUES (?,'ORIGINAL_WORK_REQUEUED',?,?,?,?,?::jsonb)",UUID.randomUUID(),id,actor.identityId(),reason,request.evidenceRef(),json.createObjectNode().put("kind",kind).put("priorAttempts",((Number)rows.getFirst().get("attempts")).intValue()).toString());
            db.update("UPDATE payment_schema."+table+" SET "+target+",attempts=0,next_attempt_at=now(),last_code=NULL WHERE "+column+"=?",id);
            return Map.of("status","ORIGINAL_WORK_REQUEUED");});
    }
}
