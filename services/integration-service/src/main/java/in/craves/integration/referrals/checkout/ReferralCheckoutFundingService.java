package in.craves.integration.referrals.checkout;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.OrderClientProperties;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.finance.source.FinancialJson;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.web.PaymentDtos.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.Duration;
import java.net.http.HttpClient;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** Original pricing stays immutable. The separate tender plan owns net collection and recovery. */
@Service
@ConditionalOnProperty(name="CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED",havingValue="true")
public class ReferralCheckoutFundingService {
    private final JdbcTemplate db;private final ObjectMapper json;private final RazorpayPaymentClient provider;private final LedgerPostingService ledger;
    private final TransactionTemplate tx,newTx;private final RestClient orders,internal;private final String internalKey;
    record Work(UUID checkout,UUID lease,UUID payment,UUID buyer,long gross,long wallet,long discount,long gateway,String hash) {}
    public record Recovery(String providerOrderId,String evidenceRef,String reason) {}
    public ReferralCheckoutFundingService(JdbcTemplate db,ObjectMapper json,RazorpayPaymentClient provider,LedgerPostingService ledger,PlatformTransactionManager manager,OrderClientProperties config,RestClient.Builder builder){
        this.db=db;this.json=json;this.provider=provider;this.ledger=ledger;this.tx=new TransactionTemplate(manager);this.newTx=new TransactionTemplate(manager);this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());factory.setReadTimeout(Duration.ofSeconds(15));
        this.orders=builder.clone().baseUrl(config.baseUrl()).requestFactory(factory).build();this.internal=builder.clone().baseUrl(config.internalBaseUrl()).requestFactory(factory).build();this.internalKey=config.internalKey();
    }
    public BigDecimal prepare(String authorization,UUID checkout,UUID buyer,BigDecimal gross,String currency){
        if(!"INR".equals(currency))throw conflict("Referral benefits require INR");
        var response=orders.get().uri("/checkout/{id}/referral-benefits",checkout).header("Authorization",authorization).retrieve().body(JsonNode.class);
        if(response==null || !Set.of("RESERVED","CONSUMED").contains(response.path("state").asText()))throw conflict("Referral benefits are not ready for payment");
        var p=response.path("funding");long total=money(p,"grossPaise"),wallet=money(p,"walletPaise"),discount=money(p,"discountPaise"),gateway=money(p,"gatewayPaise");
        if(!checkout.toString().equals(p.path("checkoutId").asText()) || !buyer.toString().equals(p.path("buyerUserId").asText()) || gross.movePointRight(2).longValueExact()!=total || total!=Math.addExact(Math.addExact(wallet,discount),gateway))throw conflict("Referral funding context differs from the checkout");
        String hash=FinancialJson.hash(p,json);
        newTx.executeWithoutResult(s->{
            lock("referral-funding/"+checkout);var old=db.queryForList("SELECT funding_hash FROM payment_schema.referral_checkout_funding WHERE checkout_id=?",checkout);
            if(!old.isEmpty()){if(!hash.equals(old.getFirst().get("funding_hash")))throw conflict("Frozen referral funding changed");return;}
            if(Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.payment_order WHERE checkout_id=?)",Boolean.class,checkout)))throw conflict("Payment collection was already started");
            var quotes=db.queryForList("SELECT response->>'total' AS total,customer_identity_id FROM payment_schema.finance_checkout_quote WHERE checkout_id=?",checkout);
            if(quotes.size()!=1 || !buyer.equals(quotes.getFirst().get("customer_identity_id")) || new BigDecimal(quotes.getFirst().get("total").toString()).compareTo(gross)!=0)throw conflict("Original Finance quote is missing or changed");
            var children=db.query("SELECT chef_order_id,payload->>'customerTotal',payload->>'customerFood' FROM payment_schema.finance_issued_snapshot WHERE checkout_id=? ORDER BY chef_order_id",(rs,n)->new ReferralTenderAllocation.Child(rs.getObject(1,UUID.class),new BigDecimal(rs.getString(2)).movePointRight(2).longValueExact(),new BigDecimal(rs.getString(3)).movePointRight(2).longValueExact()),checkout);
            var allocation=ReferralTenderAllocation.allocate(children,wallet,discount);if(allocation.stream().mapToLong(ReferralTenderAllocation.Allocation::grossPaise).sum()!=total)throw conflict("Child snapshot sum differs");
            db.update("INSERT INTO payment_schema.referral_checkout_funding(checkout_id,buyer_id,funding,funding_hash,allocation,gross_paise,wallet_paise,discount_paise,gateway_paise,payment_order_id) VALUES (?,?,?::jsonb,?,?::jsonb,?,?,?,?,?)",checkout,buyer,p.toString(),hash,write(allocation),total,wallet,discount,gateway,stable(checkout,"payment"));
        });return BigDecimal.valueOf(gateway,2);
    }
    public boolean exists(UUID checkout){return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.referral_checkout_funding WHERE checkout_id=?)",Boolean.class,checkout));}
    public UUID paymentId(UUID checkout){return db.queryForObject("SELECT payment_order_id FROM payment_schema.referral_checkout_funding WHERE checkout_id=?",UUID.class,checkout);}
    public RazorpayPaymentClient.CreatedOrder create(UUID checkout,String receipt,BigDecimal amount,String currency,Map<String,String> ignoredNotes){
        var row=newTx.execute(s->{lock("referral-funding/"+checkout);var r=db.queryForMap("SELECT * FROM payment_schema.referral_checkout_funding WHERE checkout_id=? FOR UPDATE",checkout);
            if(amount.movePointRight(2).longValueExact()!=((Number)r.get("gateway_paise")).longValue() || amount.signum()<=0 || !"INR".equals(currency))throw conflict("Frozen collection amount differs");
            if("CREATED".equals(r.get("create_state")))return r;
            if(!"READY".equals(r.get("create_state")))throw conflict("Original provider creation needs reconciliation");
            db.update("UPDATE payment_schema.referral_checkout_funding SET create_state='SENDING' WHERE checkout_id=?",checkout);return r;
        });
        if("CREATED".equals(row.get("create_state")))return decodeCreated(row.get("provider_response").toString());
        try{
            var result=provider.createOrder(receipt,amount,currency,Map.of("craves_checkout_id",checkout.toString(),"craves_customer_identity_id",row.get("buyer_id").toString()));
            newTx.executeWithoutResult(s->db.update("UPDATE payment_schema.referral_checkout_funding SET create_state='CREATED',provider_response=?::jsonb WHERE checkout_id=? AND create_state='SENDING'",write(result),checkout));return result;
        }catch(RuntimeException e){newTx.executeWithoutResult(s->db.update("UPDATE payment_schema.referral_checkout_funding SET create_state='UNKNOWN',last_code='PROVIDER_ORDER_CREATION_UNCONFIRMED' WHERE checkout_id=? AND create_state='SENDING'",checkout));throw e;}
    }
    public CreatePaymentOrderResponse zero(UUID checkout,UUID buyer){
        var row=db.queryForMap("SELECT * FROM payment_schema.referral_checkout_funding WHERE checkout_id=?",checkout);
        if(((Number)row.get("gateway_paise")).longValue()!=0 || !buyer.equals(row.get("buyer_id")))throw conflict("Invalid internal tender");
        UUID payment=(UUID)row.get("payment_order_id");String ref="CRV_"+checkout.toString().replace("-","")+"_WALLET";
        db.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider,amount,currency,status,provider_status,request_payload,response_payload) VALUES (?,?,?,?,'REFERRAL_WALLET',0,'INR','PAYMENT_PENDING','FUNDS_RESERVED','{}','{}') ON CONFLICT(id) DO NOTHING",payment,checkout,buyer,ref);
        db.update("UPDATE payment_schema.referral_checkout_funding SET create_state='NO_GATEWAY' WHERE checkout_id=? AND create_state='READY'",checkout);
        return new CreatePaymentOrderResponse(payment,checkout,ref,"REFERRAL_WALLET",null,null,null,null,BigDecimal.ZERO.setScale(2),"INR",PaymentOrderStatus.PAYMENT_PENDING,Instant.now());
    }
    @Scheduled(fixedDelayString="${CRAVES_REFERRAL_FUNDING_POLL_MS:1000}") public void tick(){for(int i=0;i<20;i++){try{if(!runOne())return;}catch(RuntimeException e){return;}}}
    public boolean runOne(){Work w=claim();if(w==null)return false;try{
        var reply=internal.post().uri("/payments/checkout/{id}/referral-paid",w.checkout()).header("X-Craves-Internal-Secret",internalKey).retrieve().body(JsonNode.class);
        if(reply==null || !"CONSUMED".equals(reply.path("state").asText()) || !w.hash().equals(FinancialJson.hash(reply.path("funding"),json)))throw conflict("Core funding is not confirmed");
        tx.executeWithoutResult(s->{
            var rows=db.queryForList("SELECT * FROM payment_schema.referral_checkout_funding WHERE checkout_id=? AND lease_id=? AND lease_until>now() FOR UPDATE",w.checkout(),w.lease());if(rows.isEmpty())return;
            var payment=db.queryForMap("SELECT * FROM payment_schema.payment_order WHERE id=? FOR UPDATE",w.payment());validatePaid(payment,w);
            Instant now=Instant.now();var lines=new ArrayList<LedgerJournal.Line>();debit(lines,"GATEWAY_CLEARING",w.gateway());debit(lines,"REFERRAL_CHECKOUT_CLEARING",w.wallet());debit(lines,"REFERRAL_MARKETING_EXPENSE",w.discount());lines.add(LedgerJournal.Line.credit("CUSTOMER_FUNDS",BigDecimal.valueOf(w.gross(),2),null));
            var receipt=ledger.post(new LedgerJournal.Entry("referral-checkout-funded/"+w.checkout(),stable(w.checkout(),"capture"),"referral-finance","REFERRAL_CHECKOUT_FUNDED",w.checkout(),null,"INR",now,"referral-funding/"+w.checkout()+"/"+w.hash(),null,"SERVICE","referral-funding-worker",lines));
            if(receipt.outcome()==LedgerJournal.Outcome.CONFLICT)throw conflict("Referral capture journal conflict");
            if(w.gateway()==0)db.update("UPDATE payment_schema.payment_order SET status='PAID',provider_status='REFERRAL_FUNDS_CONSUMED',updated_at=? WHERE id=?",Timestamp.from(now),w.payment());
            db.update("INSERT INTO payment_schema.referral_funding_capture(checkout_id,payment_order_id,gross_paise,wallet_paise,discount_paise,gateway_paise,provider_payment_id,journal_id,observed_at) VALUES (?,?,?,?,?,?,?,?,?)",w.checkout(),w.payment(),w.gross(),w.wallet(),w.discount(),w.gateway(),payment.get("provider_payment_id"),receipt.transactionId(),Timestamp.from(now));
            db.update("UPDATE payment_schema.referral_checkout_funding SET state='CONSUMED',consumed_at=?,lease_id=NULL,lease_until=NULL,last_code=NULL WHERE checkout_id=?",Timestamp.from(now),w.checkout());
            db.update("UPDATE payment_schema.referral_finance_binding SET next_observation_at=now() WHERE checkout_id=?",w.checkout());
        });
    }catch(RuntimeException e){db.update("UPDATE payment_schema.referral_checkout_funding SET state=CASE WHEN attempts>=40 THEN 'REVIEW' ELSE state END,lease_id=NULL,lease_until=NULL,next_attempt_at=now()+interval '5 seconds',last_code='FUNDING_CONFIRMATION_PENDING' WHERE checkout_id=? AND lease_id=? AND lease_until>now()",w.checkout(),w.lease());}return true;}
    private Work claim(){return tx.execute(s->{
        db.update("UPDATE payment_schema.referral_checkout_funding SET state='REVIEW',lease_id=NULL,lease_until=NULL,last_code='ATTEMPTS_EXHAUSTED' WHERE state='RESERVED' AND attempts>=40 AND (lease_until IS NULL OR lease_until<=now())");
        var rows=db.queryForList("""
            SELECT f.* FROM payment_schema.referral_checkout_funding f JOIN payment_schema.payment_order p ON p.id=f.payment_order_id
            WHERE f.state='RESERVED' AND f.attempts<40 AND f.next_attempt_at<=now() AND (f.lease_until IS NULL OR f.lease_until<=now())
              AND ((f.gateway_paise=0 AND p.provider='REFERRAL_WALLET' AND p.status='PAYMENT_PENDING') OR (f.gateway_paise>0 AND p.status='PAID' AND p.provider='RAZORPAY'))
            ORDER BY f.next_attempt_at,f.checkout_id LIMIT 1 FOR UPDATE OF f SKIP LOCKED
            """);if(rows.isEmpty())return null;var r=rows.getFirst();UUID checkout=(UUID)r.get("checkout_id"),lease=UUID.randomUUID();
        Work w=new Work(checkout,lease,(UUID)r.get("payment_order_id"),(UUID)r.get("buyer_id"),number(r,"gross_paise"),number(r,"wallet_paise"),number(r,"discount_paise"),number(r,"gateway_paise"),r.get("funding_hash").toString());
        validatePaid(db.queryForMap("SELECT * FROM payment_schema.payment_order WHERE id=?",w.payment()),w);
        db.update("UPDATE payment_schema.referral_checkout_funding SET lease_id=?,lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE checkout_id=?",lease,checkout);return w;
    });}
    private void validatePaid(Map<String,Object> payment,Work w){
        if(!w.buyer().equals(payment.get("customer_identity_id")) || !w.checkout().equals(payment.get("checkout_id")) || !"INR".equals(payment.get("currency")) || ((BigDecimal)payment.get("amount")).movePointRight(2).longValueExact()!=w.gateway())throw conflict("Payment funding identity mismatch");
        if(w.gateway()>0 && (!"PAID".equals(payment.get("status")) || !"RAZORPAY".equals(payment.get("provider")) || payment.get("provider_payment_id")==null || !payment.get("provider_payment_id").toString().matches("pay_[A-Za-z0-9]+") || !Set.of("captured","paid").contains(String.valueOf(payment.get("provider_status")).toLowerCase(Locale.ROOT))))throw conflict("External money is not captured");
        if(w.gateway()==0 && (!"REFERRAL_WALLET".equals(payment.get("provider")) || !Set.of("PAYMENT_PENDING","PAID").contains(payment.get("status"))))throw conflict("Internal tender context mismatch");
    }
    public Map<String,String> recover(CravesPrincipal actor,UUID checkout,Recovery request){
        FinancePolicyService.operator(actor);FinancePolicyService.reason(request.reason());FinancePolicyService.reason(request.evidenceRef());
        var row=db.queryForMap("SELECT * FROM payment_schema.referral_checkout_funding WHERE checkout_id=?",checkout);
        if(!Set.of("UNKNOWN","SENDING").contains(row.get("create_state")))throw conflict("Only uncertain creation can be reconciled");
        String ref="CRV_"+checkout.toString().replace("-","")+"_RZP";
        var verified=provider.fetchCreatedOrder(request.providerOrderId(),ref,BigDecimal.valueOf(number(row,"gateway_paise"),2),"INR");
        newTx.executeWithoutResult(s->db.update("UPDATE payment_schema.referral_checkout_funding SET create_state='CREATED',provider_response=?::jsonb,last_code='ORIGINAL_PROVIDER_ORDER_VERIFIED' WHERE checkout_id=? AND create_state IN ('UNKNOWN','SENDING')",write(verified),checkout));
        return Map.of("status","ORIGINAL_ORDER_VERIFIED");
    }
    private void debit(List<LedgerJournal.Line> lines,String code,long amount){if(amount>0)lines.add(LedgerJournal.Line.debit(code,BigDecimal.valueOf(amount,2),null));}
    private static long number(Map<String,Object> row,String key){return ((Number)row.get(key)).longValue();}
    static long money(JsonNode p,String field){if(!p.path(field).isTextual() || !p.path(field).asText().matches("0|[1-9][0-9]{0,12}"))throw conflict("Exact tender paise required");return Long.parseLong(p.path(field).asText());}
    private void lock(String key){db.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},key);}
    private static UUID stable(UUID checkout,String kind){return UUID.nameUUIDFromBytes(("referral-funding/"+checkout+"/"+kind).getBytes(StandardCharsets.UTF_8));}
    private String write(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalArgumentException("Invalid funding data",e);}}
    private RazorpayPaymentClient.CreatedOrder decodeCreated(String value){try{return json.readValue(value,RazorpayPaymentClient.CreatedOrder.class);}catch(Exception e){throw new IllegalStateException("Invalid provider creation receipt",e);}}
    private static ResponseStatusException conflict(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
