package in.craves.order.referrals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.referrals.transport.ReferralOutbox;
import in.craves.order.referrals.transport.ReferralSourceClient;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.HashSet;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralCheckoutBinding {
    private final JdbcTemplate db;private final ObjectMapper json;private final ReferralOutbox outbox;private final ReferralSourceClient client;
    public ReferralCheckoutBinding(JdbcTemplate db,ObjectMapper json,ReferralOutbox outbox,ReferralSourceClient client,@Value("${CRAVES_FINANCE_SOURCE_ENABLED:false}") boolean financeEnabled){
        this.db=db;this.json=json;this.outbox=outbox;this.client=client;
        if(!financeEnabled)throw new IllegalStateException("REFERRAL_REQUIRES_AUTHORITATIVE_FINANCIAL_SNAPSHOTS");
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void bind(CheckoutResponse checkout){
        if(checkout==null || checkout.orders()==null || checkout.orders().isEmpty())throw new IllegalArgumentException("Checkout required");
        var rows=db.queryForList("SELECT o.id,o.chef_identity_id,s.snapshot_hash,s.payload::text FROM order_schema.customer_order o JOIN order_schema.order_financial_snapshot s ON s.chef_order_id=o.id WHERE o.checkout_id=? ORDER BY o.id",checkout.id());
        if(rows.size()!=checkout.orders().size())throw new IllegalStateException("REFERRAL_FINANCIAL_SNAPSHOT_INCOMPLETE");
        var ids=new HashSet<UUID>();ids.add(checkout.customerIdentityId());for(var row:rows)ids.add((UUID)row.get("chef_identity_id"));
        var lookup=json.createObjectNode().put("requestId",checkout.id().toString()).put("at",checkout.createdAt().toString());
        var participants=lookup.putArray("userIds");ids.stream().sorted().forEach(id->participants.add(id.toString()));
        JsonNode reply;
        try{
            var response=client.send(ReferralSourceClient.Endpoint.LOOKUP,lookup.toString().getBytes(StandardCharsets.UTF_8));
            if(response.status()!=200)throw new IllegalStateException("REFERRAL_READINESS_UNAVAILABLE");
            reply=json.readTree(response.body());
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("REFERRAL_READINESS_INTERRUPTED",e);}
        catch(Exception e){throw new IllegalStateException("REFERRAL_READINESS_UNAVAILABLE",e);}
        if(!checkout.id().toString().equals(reply.path("requestId").asText()) || !reply.path("eligible").isBoolean())throw new IllegalStateException("REFERRAL_READINESS_CONTEXT_MISMATCH");
        // A checkout with unenrolled participants has no referral financial side effects.
        if(!reply.path("eligible").booleanValue())return;
        for(var row:rows){
            UUID order=(UUID)row.get("id");JsonNode snapshot;
            try{snapshot=json.readTree(row.get("payload").toString());}catch(Exception e){throw new IllegalStateException("Invalid stored snapshot",e);}
            var payload=json.createObjectNode().put("chefOrderId",order.toString()).put("checkoutId",checkout.id().toString())
                .put("buyerUserId",checkout.customerIdentityId().toString()).put("sellingChefUserId",row.get("chef_identity_id").toString())
                .put("foodSubtotalPaise",paise(new BigDecimal(snapshot.path("customerFood").asText())))
                .put("checkoutFoodSubtotalPaise",paise(checkout.foodSubtotal())).put("checkoutPayablePaise",paise(checkout.grandTotal()))
                .put("chefOrderCount",rows.size()).put("createdAt",checkout.createdAt().toString()).put("sourceSnapshotHash",row.get("snapshot_hash").toString()).put("currency","INR");
            UUID event=outbox.enqueue("order/"+order+"/bound","order.bound",order,checkout.createdAt(),payload);
            db.update("INSERT INTO order_schema.referral_order_binding(chef_order_id,checkout_id,buyer_id,event_id,snapshot_hash,policy_revision) VALUES (?,?,?,?,?,?)",order,checkout.id(),checkout.customerIdentityId(),event,row.get("snapshot_hash"),Long.parseLong(reply.path("policyRevision").asText()));
        }
    }
    static String paise(BigDecimal amount){if(amount==null || amount.signum()<0)throw new IllegalArgumentException("Nonnegative source money required");return Long.toString(amount.movePointRight(2).longValueExact());}
}
