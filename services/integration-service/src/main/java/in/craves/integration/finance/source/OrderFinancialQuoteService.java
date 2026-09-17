package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.finance.FinanceCalculations;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrderFinancialQuoteService {
    public record Item(UUID menuItemId,int quantity,String chefBaseUnit,String customerUnit) {
        public Item {if(menuItemId==null || quantity<1 || quantity>1000)throw new IllegalArgumentException("Invalid quote item");chefBaseUnit=LedgerMoney.text(LedgerMoney.parse(chefBaseUnit));customerUnit=LedgerMoney.text(LedgerMoney.parse(customerUnit));if(new BigDecimal(customerUnit).compareTo(new BigDecimal(chefBaseUnit))<0)throw new IllegalArgumentException("Unfunded chef discount is not permitted");}
    }
    public record DeliveryCoordinates(String pickupLatitude,String pickupLongitude,String dropoffLatitude,String dropoffLongitude) {}
    public record OrderInput(UUID chefOrderId,UUID chefIdentityId,UUID kitchenId,String pickupStateCode,String dropoffStateCode,String deliveryBeforeTax,List<Item> items,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) DeliveryCoordinates deliveryCoordinates) {
        public OrderInput(UUID chefOrderId,UUID chefIdentityId,UUID kitchenId,String pickupStateCode,String dropoffStateCode,String deliveryBeforeTax,List<Item> items) {
            this(chefOrderId,chefIdentityId,kitchenId,pickupStateCode,dropoffStateCode,deliveryBeforeTax,items,null);
        }
        public OrderInput {if(chefOrderId==null || chefIdentityId==null || kitchenId==null || !"36".equals(pickupStateCode) || !"36".equals(dropoffStateCode))throw new IllegalArgumentException("A same-state Telangana chef order is required for this launch regime");deliveryBeforeTax=LedgerMoney.text(LedgerMoney.parse(deliveryBeforeTax));if(items==null || items.isEmpty() || items.size()>100)throw new IllegalArgumentException("Bounded quote items required");items=List.copyOf(items);if(items.stream().map(Item::menuItemId).distinct().count()!=items.size())throw new IllegalArgumentException("Duplicate item");}
    }
    public record Request(UUID checkoutId,UUID customerIdentityId,Instant pricedAt,List<OrderInput> orders) {}
    public record Response(UUID checkoutId,String requestHash,String total,List<JsonNode> snapshots) {}
    private final JdbcTemplate jdbc;private final ObjectMapper json;private final FinancePolicyService policies;private final ChefTaxProfileService taxProfiles;
    public OrderFinancialQuoteService(JdbcTemplate jdbc,ObjectMapper json,FinancePolicyService policies,ChefTaxProfileService taxProfiles){this.jdbc=jdbc;this.json=json;this.policies=policies;this.taxProfiles=taxProfiles;}
    @Transactional
    public Response quote(Request request) {
        if(request==null || request.checkoutId()==null || request.customerIdentityId()==null || request.pricedAt()==null || request.orders()==null || request.orders().isEmpty() || request.orders().size()>50)throw bad("Invalid checkout quote");
        String requestHash=FinancialJson.hash(json.valueToTree(request),json);
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",rs->{return null;},"finance-quote/"+request.checkoutId());
        var previous=jdbc.queryForList("SELECT request_hash,response::text FROM payment_schema.finance_checkout_quote WHERE checkout_id=?",request.checkoutId());
        if(!previous.isEmpty()) {
            if(!requestHash.equals(previous.getFirst().get("request_hash")))throw conflict("Checkout quote identifier was reused with changed context");return decode(previous.getFirst().get("response").toString());
        }
        var resolved=policies.current();FinancePolicy policy=resolved.settings();
        if(!policy.ledgerEnabled() || resolved.policyId()==null || !policy.inScope(request.pricedAt()))throw conflict("Ledger policy is not enabled for this order date");
        if(request.pricedAt().isAfter(Instant.now().plusSeconds(30)) || request.pricedAt().isBefore(Instant.now().minusSeconds(300)))throw bad("Quote creation time is outside the binding window");
        var weights=new LinkedHashMap<String,BigDecimal>();var ids=new HashSet<UUID>();
        for(OrderInput order:request.orders()) {if(!ids.add(order.chefOrderId()))throw bad("Duplicate chef-order identity");weights.put(order.chefOrderId().toString(),sum(order.items(),false));}
        var platform=LedgerMoney.allocate(LedgerMoney.parse(policy.platformFee()),weights);
        var platformGst=LedgerMoney.allocate(FinanceCalculations.percent(LedgerMoney.parse(policy.platformFee()),policy.platformGstPercent()),platform);
        var snapshots=new ArrayList<JsonNode>();BigDecimal total=LedgerMoney.ZERO;
        for(OrderInput order:request.orders()) {
            var profile=taxProfiles.resolved(order.chefIdentityId());
            if("REGISTRATION_REVIEW_REQUIRED".equals(profile.registrationReview()))throw conflict("Chef registration requires review; turnover does not authorize a GST deduction");
            if(!profile.profile().stateCode().equals(order.pickupStateCode()))throw conflict("Tax profile does not match kitchen jurisdiction");
            BigDecimal base=sum(order.items(),true),food=sum(order.items(),false),delivery=LedgerMoney.parse(order.deliveryBeforeTax());
            in.craves.integration.finance.DeliveryTariff.Quote deliveryQuote=null;
            if(policy.deliveryTariff()!=null) {
                var coordinates=order.deliveryCoordinates();
                if(coordinates==null)throw conflict("Verified kitchen and customer coordinates are required for the configured distance tariff");
                deliveryQuote=policy.deliveryTariff().between(coordinate(coordinates.pickupLatitude()),coordinate(coordinates.pickupLongitude()),
                    coordinate(coordinates.dropoffLatitude()),coordinate(coordinates.dropoffLongitude()),policy.deliveryGstPercent());
                delivery=LedgerMoney.parse(deliveryQuote.beforeTax());
            }
            var chef=FinanceCalculations.chef(base.toPlainString(),policy);
            BigDecimal withholding=FinanceCalculations.percent(base,profile.profile().withholdingRate());
            BigDecimal payable=LedgerMoney.parse(chef.payable()).subtract(withholding);
            if(payable.signum()<0)throw conflict("Approved deductions exceed the chef base");
            BigDecimal fee=platform.get(order.chefOrderId().toString());
            BigDecimal foodTax=FinanceCalculations.percent(food,policy.restaurantGstPercent()),deliveryTax=FinanceCalculations.percent(delivery,policy.deliveryGstPercent()),feeTax=platformGst.get(order.chefOrderId().toString());
            BigDecimal tax=foodTax.add(deliveryTax).add(feeTax),gross=food.add(delivery).add(fee).add(tax);
            ObjectNode snapshot=json.createObjectNode();
            snapshot.put("schemaVersion","1.0").put("snapshotId",UUID.randomUUID().toString()).put("checkoutId",request.checkoutId().toString())
                .put("chefOrderId",order.chefOrderId().toString()).put("customerIdentityId",request.customerIdentityId().toString())
                .put("chefIdentityId",order.chefIdentityId().toString()).put("kitchenId",order.kitchenId().toString())
                .put("pricedAt",request.pricedAt().truncatedTo(ChronoUnit.MICROS).toString()).put("orderSource","ON_DEMAND").put("currency","INR")
                .put("priceModel","EXPLICIT_CHEF_AND_CUSTOMER_UNIT_V1").put("chefGross",LedgerMoney.text(base)).put("customerFood",LedgerMoney.text(food))
                .put("delivery",LedgerMoney.text(delivery)).put("platform",LedgerMoney.text(fee)).put("foodGst",LedgerMoney.text(foodTax))
                .put("deliveryGst",LedgerMoney.text(deliveryTax)).put("platformGst",LedgerMoney.text(feeTax)).put("customerTax",LedgerMoney.text(tax))
                .put("customerTotal",LedgerMoney.text(gross)).put("chefServiceFee",chef.serviceFee()).put("chefFeeGst",chef.serviceFeeTax())
                .put("chefFoodGstDeduction","0.00").put("gstTcsDeduction","0.00").put("withholding",LedgerMoney.text(withholding)).put("chefPayable",LedgerMoney.text(payable))
                .put("foodGstLiableParty","CRAVES_ECO_SECTION_9_5").put("policyId",resolved.policyId().toString()).put("policyRevision",resolved.revision())
                .put("chefTaxProfileId",profile.id().toString()).put("stateCode","36");
            snapshot.set("items",json.valueToTree(order.items()));snapshot.set("policy",json.valueToTree(policy));
            if(deliveryQuote!=null) snapshot.set("deliveryQuote",json.valueToTree(deliveryQuote));
            snapshot.put("hash",FinancialJson.hash(snapshot,json));snapshots.add(snapshot);total=total.add(gross);
            jdbc.update("INSERT INTO payment_schema.finance_issued_snapshot(id,checkout_id,chef_order_id,chef_identity_id,snapshot_hash,payload) VALUES (?,?,?,?,?,CAST(? AS jsonb))",
                UUID.fromString(snapshot.path("snapshotId").asText()),request.checkoutId(),order.chefOrderId(),order.chefIdentityId(),snapshot.path("hash").asText(),snapshot.toString());
        }
        Response response=new Response(request.checkoutId(),requestHash,LedgerMoney.text(total),List.copyOf(snapshots));
        jdbc.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,CAST(? AS jsonb))",request.checkoutId(),request.customerIdentityId(),requestHash,encode(response));
        return response;
    }
    private static BigDecimal sum(List<Item> items,boolean chef) {return LedgerMoney.amount(items.stream().map(i->LedgerMoney.parse(chef?i.chefBaseUnit():i.customerUnit()).multiply(BigDecimal.valueOf(i.quantity()))).reduce(LedgerMoney.ZERO,BigDecimal::add));}
    private static BigDecimal coordinate(String value) {
        if(value==null || !value.matches("-?[0-9]{1,3}(\\.[0-9]{1,15})?"))throw bad("Invalid verified location coordinate");
        return new BigDecimal(value);
    }
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw bad("Invalid financial quote");}}
    private Response decode(String value){try{return json.readValue(value,Response.class);}catch(Exception e){throw new IllegalStateException("Stored quote is invalid",e);}}
    private static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    private static ResponseStatusException conflict(String message){return new ResponseStatusException(HttpStatus.CONFLICT,message);}
}
