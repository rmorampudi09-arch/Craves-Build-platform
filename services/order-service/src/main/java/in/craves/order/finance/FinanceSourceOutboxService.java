package in.craves.order.finance;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FinanceSourceOutboxService {
    public record Work(UUID eventId,UUID orderId,UUID leaseId,String payload,int attempts) {}
    private static final Set<String> ACCEPTED=Set.of("POSTED","WAITING_VERIFIED_CAPTURE","CAPTURED_AWAITING_DELIVERY","INELIGIBLE_SOURCE_STATE","REFUND_REVIEW_REQUIRED","SOURCE_REVIEW_REQUIRED");
    private final JdbcTemplate jdbc;
    public FinanceSourceOutboxService(JdbcTemplate jdbc){this.jdbc=jdbc;}
    @Transactional public Work claim(){
        UUID lease=UUID.randomUUID();
        var rows=jdbc.query("WITH candidate AS (SELECT event_id FROM order_schema.finance_source_outbox WHERE (status='PENDING' AND next_attempt_at<=now()) OR (status='SENDING' AND lease_until<now()) ORDER BY created_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE order_schema.finance_source_outbox o SET status='SENDING',lease_id=?,lease_until=now()+interval '60 seconds',attempts=attempts+1 FROM candidate c WHERE o.event_id=c.event_id RETURNING o.*",
            (rs,n)->new Work(rs.getObject("event_id",UUID.class),rs.getObject("chef_order_id",UUID.class),lease,rs.getString("payload"),rs.getInt("attempts")),lease);
        return rows.isEmpty()?null:rows.getFirst();
    }
    @Transactional public void complete(Work work,JsonNode response){
        if(!work.orderId().toString().equals(response.path("chefOrderId").asText()) || !response.path("result").isTextual())throw new IllegalStateException("Finance acknowledgement does not match its order");
        String result=response.path("result").asText();
        if(result.length()>160 || (!ACCEPTED.contains(result) && !result.matches("CONFLICT_[A-Z_]+")))throw new IllegalStateException("Unsupported finance acknowledgement");
        if(result.equals("POSTED") && !response.path("earningJournalId").asText().matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))throw new IllegalStateException("Posted acknowledgement has no journal proof");
        jdbc.update("UPDATE order_schema.finance_source_outbox SET status=?,last_result=?,lease_id=NULL,lease_until=NULL WHERE event_id=? AND lease_id=?",result.startsWith("CONFLICT_")?"DEAD":"SENT",result,work.eventId(),work.leaseId());
    }
    @Transactional public void retry(Work work){
        long delay=Math.min(3600L,5L*(1L<<Math.min(9,work.attempts())))+ThreadLocalRandom.current().nextLong(1,10);
        jdbc.update("UPDATE order_schema.finance_source_outbox SET status=?,last_result='FINANCE_DELIVERY_UNCONFIRMED',next_attempt_at=?,lease_id=NULL,lease_until=NULL WHERE event_id=? AND lease_id=?",
            work.attempts()>=40?"DEAD":"PENDING",Timestamp.from(Instant.now().plusSeconds(delay)),work.eventId(),work.leaseId());
    }
}
