package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.ChefPayoutService;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The signed Order Service lifecycle, issued snapshot and local verified payment must all agree. */
@Service
public class OrderFinancialFinalizationService {
    public record Receipt(UUID chefOrderId,String result,UUID earningJournalId) {}
    private final JdbcTemplate jdbc;private final ObjectMapper json;private final LedgerPostingService ledger;private final ChefPayoutService payouts;private final boolean enabled;
    public OrderFinancialFinalizationService(JdbcTemplate jdbc,ObjectMapper json,LedgerPostingService ledger,ChefPayoutService payouts,
        @Value("${CRAVES_FINANCE_FINALIZATION_ENABLED:false}") boolean enabled){this.jdbc=jdbc;this.json=json;this.ledger=ledger;this.payouts=payouts;this.enabled=enabled;}
    @Transactional
    public Receipt accept(JsonNode event) {
        if(!enabled)throw new IllegalStateException("Financial finalization is disabled");
        UUID eventId=id(event,"eventId"),order=id(event,"chefOrderId"),snapshotId=id(event,"snapshotId");
        String kind=text(event,"kind");long version=event.path("sourceVersion").asLong(-1);
        if(!"order-service".equals(text(event,"source")) || !"1.0".equals(text(event,"schemaVersion")) || !Set.of("BOUND","DELIVERED","CANCELLED").contains(kind)
            || (kind.equals("BOUND")?version!=1:version!=2))throw new IllegalArgumentException("Unsupported financial lifecycle contract");
        var eventContent=event.deepCopy();((ObjectNode)eventContent).remove("eventId");String hash=FinancialJson.hash(eventContent,json);
        var issued=jdbc.queryForList("SELECT payload::text,snapshot_hash,chef_identity_id FROM payment_schema.finance_issued_snapshot WHERE id=? AND chef_order_id=?",snapshotId,order);
        if(issued.isEmpty())return exception(eventId,order,hash,"UNISSUED_FINANCIAL_SNAPSHOT");
        JsonNode snapshot=parse(issued.getFirst().get("payload").toString());UUID chef=id(snapshot,"chefIdentityId");lock("chef-payout/"+chef);lock("finance-source/"+order);
        if(!text(snapshot,"hash").equals(text(event,"snapshotHash")) || !id(snapshot,"checkoutId").equals(id(event,"checkoutId"))
            || !text(snapshot,"customerTotal").equals(text(event,"orderTotal")))return exception(eventId,order,hash,"SOURCE_SNAPSHOT_CONTEXT_CHANGED");
        String checkoutTotal=jdbc.queryForObject("SELECT response->>'total' FROM payment_schema.finance_checkout_quote WHERE checkout_id=?",String.class,id(snapshot,"checkoutId"));
        if(!checkoutTotal.equals(text(event,"checkoutTotal")))return exception(eventId,order,hash,"CHECKOUT_AMOUNT_CHANGED");
        var prior=jdbc.queryForList("SELECT event_id,payload_hash,chef_order_id FROM payment_schema.finance_source_event WHERE event_id=? OR (chef_order_id=? AND source_version=?)",eventId,order,version);
        if(!prior.isEmpty()) {
            for(var row:prior)if(!order.equals(row.get("chef_order_id")) || !hash.equals(row.get("payload_hash")))return exception(eventId,order,hash,"SOURCE_VERSION_OR_EVENT_CONFLICT");
            return finish(order);
        }
        Instant delivered=null;UUID job=null;
        if(kind.equals("DELIVERED")) {
            if(!"DELIVERED".equals(text(event,"commercialStatus")) || !"DELIVERED".equals(text(event,"deliveryStatus")))return exception(eventId,order,hash,"DELIVERY_NOT_AUTHORITATIVE");
            delivered=Instant.parse(text(event,"deliveredAt"));job=id(event,"deliveryJobId");
            Instant accepted=Instant.parse(text(event,"chefAcceptedAt"));
            if(delivered.isBefore(Instant.parse(text(snapshot,"pricedAt"))) || delivered.isBefore(accepted) || delivered.isAfter(Instant.now().plusSeconds(300)))return exception(eventId,order,hash,"INVALID_DELIVERY_TIME");
        }
        jdbc.update("INSERT INTO payment_schema.finance_source_event(event_id,chef_order_id,kind,source_version,payload_hash,payload) VALUES (?,?,?,?,?,CAST(? AS jsonb))",eventId,order,kind,version,hash,event.toString());
        jdbc.update("INSERT INTO payment_schema.finance_order_binding(chef_order_id,snapshot_id,state,source_version,delivery_job_id,delivered_at) VALUES (?,?,?,?,?,?) ON CONFLICT(chef_order_id) DO UPDATE SET state=EXCLUDED.state,source_version=EXCLUDED.source_version,delivery_job_id=EXCLUDED.delivery_job_id,delivered_at=EXCLUDED.delivered_at,updated_at=now() WHERE payment_schema.finance_order_binding.source_version<EXCLUDED.source_version",
            order,snapshotId,kind,version,job,delivered==null?null:Timestamp.from(delivered));
        return finish(order);
    }
    public List<UUID> pending() {
        if(!enabled)return List.of();
        return jdbc.query("SELECT chef_order_id FROM payment_schema.finance_order_binding WHERE earning_journal_id IS NULL AND state IN ('BOUND','DELIVERED') ORDER BY updated_at,chef_order_id LIMIT 50",(rs,n)->rs.getObject(1,UUID.class));
    }
    @Transactional
    public Receipt finish(UUID order) {
        if(!enabled)throw new IllegalStateException("Financial finalization is disabled");
        var rows=jdbc.queryForList("SELECT s.payload::text,s.chef_identity_id FROM payment_schema.finance_order_binding b JOIN payment_schema.finance_issued_snapshot s ON s.id=b.snapshot_id WHERE b.chef_order_id=?",order);
        if(rows.isEmpty())return new Receipt(order,"NO_BINDING",null);
        JsonNode snapshot=parse(rows.getFirst().get("payload").toString());UUID chef=id(snapshot,"chefIdentityId"),checkout=id(snapshot,"checkoutId");
        lock("chef-payout/"+chef);lock("finance-source/"+order);
        var binding=jdbc.queryForMap("SELECT * FROM payment_schema.finance_order_binding WHERE chef_order_id=? FOR UPDATE",order);
        if(binding.get("earning_journal_id")!=null)return new Receipt(order,"POSTED",(UUID)binding.get("earning_journal_id"));
        if(!Set.of("BOUND","DELIVERED").contains(binding.get("state").toString()))return result(order,"INELIGIBLE_SOURCE_STATE");
        var captured=capture(checkout,id(snapshot,"customerIdentityId"));
        if(captured==null)return result(order,"WAITING_VERIFIED_CAPTURE");
        if(!"DELIVERED".equals(binding.get("state")))return result(order,"CAPTURED_AWAITING_DELIVERY");
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.refund WHERE chef_sub_order_id=? AND status NOT IN ('FAILED','CANCELLED'))",Boolean.class,order))) {
            jdbc.update("UPDATE payment_schema.finance_order_binding SET state='REVIEW_REQUIRED',last_result='REFUND_RESERVATION_EXISTS',updated_at=now() WHERE chef_order_id=?",order);
            return new Receipt(order,"REFUND_REVIEW_REQUIRED",null);
        }
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.chef_earning_entry WHERE order_id=?)",Boolean.class,order)))return exception(null,order,text(snapshot,"hash"),"LEGACY_EARNING_ALREADY_EXISTS");
        UUID paymentId=(UUID)captured.get("payment_order_id");Instant delivered=((Timestamp)binding.get("delivered_at")).toInstant();
        var lines=new ArrayList<LedgerJournal.Line>();
        debit(lines,"CUSTOMER_FUNDS",money(snapshot,"customerTotal"),chef,paymentId);
        credit(lines,"CHEF_PAYABLE",money(snapshot,"chefPayable"),chef,paymentId);
        credit(lines,"CHEF_FEE_REVENUE",money(snapshot,"chefServiceFee"),chef,paymentId);
        credit(lines,"CHEF_FEE_GST_PAYABLE",money(snapshot,"chefFeeGst"),chef,paymentId);
        credit(lines,"WITHHOLDING_PAYABLE",money(snapshot,"withholding"),chef,paymentId);
        credit(lines,"CUSTOMER_UPLIFT_REVENUE",money(snapshot,"customerFood").subtract(money(snapshot,"chefGross")),chef,paymentId);
        credit(lines,"DELIVERY_REVENUE",money(snapshot,"delivery"),chef,paymentId);
        credit(lines,"PLATFORM_FEE_REVENUE",money(snapshot,"platform"),chef,paymentId);
        credit(lines,"RESTAURANT_GST_PAYABLE",money(snapshot,"foodGst"),chef,paymentId);
        credit(lines,"DELIVERY_GST_PAYABLE",money(snapshot,"deliveryGst"),chef,paymentId);
        credit(lines,"PLATFORM_GST_PAYABLE",money(snapshot,"platformGst"),chef,paymentId);
        String key="chef-order/"+order+"/normal-earning/v1";
        var posted=ledger.post(new LedgerJournal.Entry(key,stable(key),"order-service","CHEF_ORDER_EARNING",checkout,order,"INR",delivered,"snapshot/"+text(snapshot,"snapshotId")+"/"+text(snapshot,"hash"),null,"SERVICE","order-finance-finalizer",lines));
        if(posted.outcome()==LedgerJournal.Outcome.CONFLICT)return exception(null,order,text(snapshot,"hash"),"EARNING_JOURNAL_CONFLICT");
        jdbc.update("INSERT INTO payment_schema.finance_earning_projection(chef_order_id,checkout_id,chef_identity_id,snapshot_id,gross,service_fee,fee_gst,withholding,payable,delivered_at,journal_id) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(chef_order_id) DO NOTHING",
            order,checkout,chef,id(snapshot,"snapshotId"),money(snapshot,"chefGross"),money(snapshot,"chefServiceFee"),money(snapshot,"chefFeeGst"),money(snapshot,"withholding"),money(snapshot,"chefPayable"),Timestamp.from(delivered),posted.transactionId());
        FinancePolicy policy;
        try{policy=json.treeToValue(snapshot.path("policy"),FinancePolicy.class);}catch(Exception e){throw new IllegalStateException("Frozen policy is invalid",e);}
        if(money(snapshot,"chefPayable").signum()>0)payouts.recordDeliveredPayable(chef,order,posted.transactionId(),delivered,policy);
        jdbc.update("UPDATE payment_schema.finance_order_binding SET earning_journal_id=?,last_result='POSTED',updated_at=now() WHERE chef_order_id=?",posted.transactionId(),order);
        return new Receipt(order,"POSTED",posted.transactionId());
    }
    private Map<String,Object> capture(UUID checkout,UUID customer) {
        lock("finance-capture/"+checkout);
        var paid=jdbc.queryForList("SELECT * FROM payment_schema.payment_order WHERE checkout_id=? AND status='PAID' ORDER BY id FOR UPDATE",checkout);
        if(paid.size()!=1)return null;var payment=paid.getFirst();
        String ref=(String)payment.get("provider_payment_id");String provider=(String)payment.get("provider");String providerStatus=(String)payment.get("provider_status");
        if(!customer.equals(payment.get("customer_identity_id")) || !"INR".equals(payment.get("currency")) || !"RAZORPAY".equals(provider)
            || ref==null || !ref.matches("pay_[A-Za-z0-9]+") || providerStatus==null || !Set.of("captured","paid").contains(providerStatus.toLowerCase(java.util.Locale.ROOT)))return null;
        BigDecimal expected=new BigDecimal(jdbc.queryForObject("SELECT response->>'total' FROM payment_schema.finance_checkout_quote WHERE checkout_id=?",String.class,checkout));
        if(expected.compareTo((BigDecimal)payment.get("amount"))!=0)return null;
        var existing=jdbc.queryForList("SELECT * FROM payment_schema.finance_capture WHERE checkout_id=?",checkout);
        if(!existing.isEmpty()) {
            var prior=existing.getFirst();if(!payment.get("id").equals(prior.get("payment_order_id")) || !ref.equals(prior.get("provider_payment_id")))return null;return prior;
        }
        String key="checkout/"+checkout+"/verified-capture/v1";UUID paymentId=(UUID)payment.get("id");
        var lines=List.of(new LedgerJournal.Line("GATEWAY_CLEARING","INR",LedgerMoney.text(expected),"0.00",null,null,null,paymentId,null,null),
            new LedgerJournal.Line("CUSTOMER_FUNDS","INR","0.00",LedgerMoney.text(expected),null,null,null,paymentId,null,null));
        var posted=ledger.post(new LedgerJournal.Entry(key,stable(key),"integration-payment","PAYMENT_CAPTURED",checkout,null,"INR",((Timestamp)payment.get("updated_at")).toInstant(),"razorpay/"+ref,null,"SERVICE","verified-capture-recognizer",lines));
        if(posted.outcome()==LedgerJournal.Outcome.CONFLICT)return null;
        jdbc.update("INSERT INTO payment_schema.finance_capture(checkout_id,payment_order_id,provider_payment_id,captured_amount,currency,journal_id) VALUES (?,?,?,?,'INR',?)",checkout,paymentId,ref,expected,posted.transactionId());
        return jdbc.queryForMap("SELECT * FROM payment_schema.finance_capture WHERE checkout_id=?",checkout);
    }
    private Receipt exception(UUID event,UUID order,String hash,String reason) {
        jdbc.update("INSERT INTO payment_schema.finance_source_exception(id,event_id,chef_order_id,reason,attempted_hash) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING",UUID.randomUUID(),event,order,reason,hash);
        jdbc.update("UPDATE payment_schema.finance_order_binding SET state='REVIEW_REQUIRED',last_result=?,updated_at=now() WHERE chef_order_id=?",reason,order);
        return new Receipt(order,"CONFLICT_"+reason,null);
    }
    private Receipt result(UUID order,String state){jdbc.update("UPDATE payment_schema.finance_order_binding SET last_result=?,updated_at=now() WHERE chef_order_id=?",state,order);return new Receipt(order,state,null);}
    private void lock(String key){jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},key);}
    private void credit(List<LedgerJournal.Line> lines,String account,BigDecimal amount,UUID chef,UUID payment){if(amount.signum()>0)lines.add(new LedgerJournal.Line(account,"INR","0.00",LedgerMoney.text(amount),chef,null,null,payment,null,null));}
    private void debit(List<LedgerJournal.Line> lines,String account,BigDecimal amount,UUID chef,UUID payment){if(amount.signum()>0)lines.add(new LedgerJournal.Line(account,"INR",LedgerMoney.text(amount),"0.00",chef,null,null,payment,null,null));}
    private static BigDecimal money(JsonNode value,String field){return LedgerMoney.parse(text(value,field));}
    private static String text(JsonNode value,String field){if(!value.path(field).isTextual())throw new IllegalArgumentException("Missing financial field: "+field);return value.path(field).asText();}
    private static UUID id(JsonNode value,String field){return UUID.fromString(text(value,field));}
    private static UUID stable(String key){return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));}
    private JsonNode parse(String value){try{return json.readTree(value);}catch(Exception e){throw new IllegalStateException("Invalid financial evidence",e);}}
}
