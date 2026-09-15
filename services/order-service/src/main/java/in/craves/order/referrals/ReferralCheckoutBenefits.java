package in.craves.order.referrals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.referrals.transport.ReferralSourceClient;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED",havingValue="true")
public class ReferralCheckoutBenefits {
    private final JdbcTemplate db;private final ObjectMapper json;private final ReferralSourceClient client;private final TransactionTemplate tx;
    record Work(UUID checkout,UUID lease,String stage,String envelope,int attempts) {}
    public ReferralCheckoutBenefits(JdbcTemplate db,ObjectMapper json,ReferralSourceClient client,PlatformTransactionManager manager){this.db=db;this.json=json;this.client=client;this.tx=new TransactionTemplate(manager);}
    public void prepare(CheckoutResponse c,JsonNode request){
        if(request==null || request.isNull())return;
        if(!request.isObject())throw bad("Invalid referral benefits");request.fieldNames().forEachRemaining(f->{if(!Set.of("walletPaise","inviteeDiscount").contains(f))throw bad("Unknown referral benefit field");});
        long wallet=money(request,"walletPaise");if(!request.path("inviteeDiscount").isBoolean())throw bad("Explicit invitee discount preference required");
        boolean discount=request.path("inviteeDiscount").asBoolean();if(wallet==0 && !discount)throw bad("At least one referral benefit required");
        if(wallet>c.grandTotal().movePointRight(2).longValueExact())throw bad("Wallet amount exceeds checkout");
        if(db.queryForObject("SELECT count(*) FROM order_schema.referral_order_binding WHERE checkout_id=?",Integer.class,c.id())!=c.orders().size())throw conflict("All participants must be enrolled before using referral benefits");
        boolean first=!Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.checkout WHERE customer_identity_id=? AND id<>? AND food_subtotal>=800 AND (created_at,id)<(?,?))",Boolean.class,c.customerIdentityId(),c.id(),java.sql.Timestamp.from(c.createdAt()),c.id()));
        if(discount && (!first || c.foodSubtotal().compareTo(new BigDecimal("800"))<0))throw conflict("Invitee discount requires the first qualifying checkout");
        var body=json.createObjectNode().put("checkoutId",c.id().toString()).put("buyerUserId",c.customerIdentityId().toString()).put("grossPaise",ReferralCheckoutBinding.paise(c.grandTotal())).put("foodSubtotalPaise",ReferralCheckoutBinding.paise(c.foodSubtotal())).put("walletPaise",Long.toString(wallet)).put("inviteeDiscount",discount).put("createdAt",c.createdAt().toString()).put("firstQualifyingOrderEligible",first).put("evidenceRef","order-checkout/"+c.id());
        db.update("INSERT INTO order_schema.referral_checkout_benefit(checkout_id,buyer_id,reserve_envelope) VALUES (?,?,?::jsonb)",c.id(),c.customerIdentityId(),envelope(c.id(),"reserve",body).toString());
    }
    public JsonNode read(CravesPrincipal actor,UUID checkout){
        if(actor==null || !Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.checkout WHERE id=? AND customer_identity_id=?)",Boolean.class,checkout,actor.identityId())))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Checkout not found");
        return read(checkout);
    }
    public JsonNode read(UUID checkout){
        var rows=db.queryForList("SELECT state,result FROM order_schema.referral_checkout_benefit WHERE checkout_id=?",checkout);
        if(rows.isEmpty())return json.createObjectNode().put("state","NONE");var row=rows.getFirst();var response=json.createObjectNode().put("state",row.get("state").toString());
        if(row.get("result")!=null)response.set("funding",parse(row.get("result").toString()));return response;
    }
    /** The caller is the authenticated Finance paid callback. Return only after the core consumed both legs. */
    public boolean requestConsumption(UUID checkout){return Boolean.TRUE.equals(tx.execute(s->{
        var rows=db.queryForList("SELECT * FROM order_schema.referral_checkout_benefit WHERE checkout_id=? FOR UPDATE",checkout);if(rows.isEmpty())return true;var row=rows.getFirst();String state=row.get("state").toString();
        if(state.equals("CONSUMED"))return true;
        if(state.equals("RESERVED")){
            JsonNode result=parse(row.get("result").toString());var body=json.createObjectNode().put("checkoutId",checkout.toString()).put("buyerUserId",row.get("buyer_id").toString()).put("walletPaise",result.path("walletPaise").asText()).put("discountPaise",result.path("discountPaise").asText()).put("evidenceRef","finance-confirmed-checkout/"+checkout).put("checkoutCancellationConfirmed",false);
            db.update("UPDATE order_schema.referral_checkout_benefit SET state='CONSUMING',finish_envelope=?::jsonb,attempts=0,next_attempt_at=now() WHERE checkout_id=?",envelope(checkout,"consume",body).toString(),checkout);
        }return false;
    }));}
    @Scheduled(fixedDelayString="${CRAVES_REFERRAL_CHECKOUT_POLL_MS:1000}") public void tick(){for(int i=0;i<20;i++)if(!runOne())return;}
    public boolean runOne(){Work w=claim();if(w==null)return false;try{
        var response=client.send(ReferralSourceClient.Endpoint.OPERATIONS,w.envelope().getBytes(StandardCharsets.UTF_8));
        if(response.status()!=200)throw new IllegalStateException("REFERRAL_OPERATION_NOT_CONFIRMED");
        var value=json.readTree(response.body());JsonNode p=parse(w.envelope()).path("payload");
        String target=w.stage().equals("RESERVING")?"RESERVED":w.stage().equals("CONSUMING")?"CONSUMED":"RELEASED";
        if(!w.checkout().toString().equals(value.path("checkoutId").asText()) || !target.equals(value.path("status").asText()))throw new IllegalStateException("REFERRAL_OPERATION_CONTEXT_MISMATCH");
        if(w.stage().equals("RESERVING")){
            long gross=money(p,"grossPaise"),wallet=money(value,"walletPaise"),off=money(value,"discountPaise"),net=money(value,"gatewayPaise");
            if(wallet!=money(p,"walletPaise") || gross!=Math.addExact(Math.addExact(wallet,off),net) || gross!=money(value,"grossPaise") || !p.path("buyerUserId").asText().equals(value.path("buyerUserId").asText()))throw new IllegalStateException("REFERRAL_AMOUNT_MISMATCH");
            db.update("UPDATE order_schema.referral_checkout_benefit SET state='RESERVED',result=?::jsonb,lease_id=NULL,lease_until=NULL,last_code=NULL WHERE checkout_id=? AND lease_id=? AND lease_until>now()",value.toString(),w.checkout(),w.lease());
        }else{
            if(money(value,"walletPaise")!=money(p,"walletPaise") || money(value,"discountPaise")!=money(p,"discountPaise"))throw new IllegalStateException("REFERRAL_FINISH_AMOUNT_MISMATCH");
            db.update("UPDATE order_schema.referral_checkout_benefit SET state=?,lease_id=NULL,lease_until=NULL,last_code=NULL WHERE checkout_id=? AND lease_id=? AND lease_until>now()",target,w.checkout(),w.lease());
        }
    }catch(InterruptedException e){Thread.currentThread().interrupt();failed(w);}catch(Exception e){failed(w);}return true;}
    private Work claim(){return tx.execute(s->{
        db.update("UPDATE order_schema.referral_checkout_benefit SET state='REVIEW',lease_id=NULL,lease_until=NULL,last_code='ATTEMPTS_EXHAUSTED' WHERE state IN ('RESERVING','CONSUMING','RELEASING') AND attempts>=40 AND (lease_until IS NULL OR lease_until<=now())");
        var rows=db.queryForList("SELECT * FROM order_schema.referral_checkout_benefit WHERE state IN ('RESERVING','CONSUMING','RELEASING') AND attempts<40 AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY next_attempt_at,checkout_id LIMIT 1 FOR UPDATE SKIP LOCKED");
        if(rows.isEmpty())return null;var r=rows.getFirst();UUID lease=UUID.randomUUID(),checkout=(UUID)r.get("checkout_id");String stage=r.get("state").toString();
        db.update("UPDATE order_schema.referral_checkout_benefit SET lease_id=?,lease_until=now()+interval '60 seconds',attempts=attempts+1 WHERE checkout_id=?",lease,checkout);
        return new Work(checkout,lease,stage,r.get(stage.equals("RESERVING")?"reserve_envelope":"finish_envelope").toString(),((Number)r.get("attempts")).intValue()+1);
    });}
    private void failed(Work w){db.update("UPDATE order_schema.referral_checkout_benefit SET state=?,next_attempt_at=now()+(?*interval '1 second'),lease_id=NULL,lease_until=NULL,last_code='OPERATION_UNCONFIRMED' WHERE checkout_id=? AND lease_id=? AND lease_until>now()",w.attempts()>=40?"REVIEW":w.stage(),Math.min(3600,1L<<Math.min(w.attempts(),11)),w.checkout(),w.lease());}
    private JsonNode envelope(UUID id,String action,JsonNode payload){return json.createObjectNode().put("operationId",UUID.nameUUIDFromBytes(("checkout-benefits/"+id+"/"+action).getBytes(StandardCharsets.UTF_8)).toString()).put("operationType","checkout."+action).set("payload",payload);}
    private JsonNode parse(String value){try{return json.readTree(value);}catch(Exception e){throw new IllegalStateException("Invalid checkout evidence",e);}}
    static long money(JsonNode p,String field){if(!p.path(field).isTextual() || !p.path(field).asText().matches("0|[1-9][0-9]{0,12}"))throw bad("Exact paise required: "+field);return Long.parseLong(p.path(field).asText());}
    static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    static ResponseStatusException conflict(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
