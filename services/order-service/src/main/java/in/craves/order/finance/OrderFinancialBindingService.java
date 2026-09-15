package in.craves.order.finance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.service.CatalogClient;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Runs before checkout commit. Any quote/ownership failure rolls back checkout and cart mutation. */
@Service
public class OrderFinancialBindingService {
    private final JdbcTemplate jdbc;private final ObjectMapper json;private final CatalogClient catalog;private final FinanceSourceClient finance;
    public OrderFinancialBindingService(JdbcTemplate jdbc,ObjectMapper json,CatalogClient catalog,FinanceSourceClient finance){this.jdbc=jdbc;this.json=json;this.catalog=catalog;this.finance=finance;}
    @Transactional(propagation=Propagation.MANDATORY)
    public void bind(CheckoutResponse checkout){
        if(checkout==null || checkout.id()==null || checkout.customerIdentityId()==null || checkout.orders()==null || checkout.orders().isEmpty())throw new IllegalArgumentException("Checkout source is incomplete");
        ObjectNode request=json.createObjectNode().put("checkoutId",checkout.id().toString()).put("customerIdentityId",checkout.customerIdentityId().toString()).put("pricedAt",checkout.createdAt().toString());
        var requested=request.putArray("orders");Map<UUID,UUID> chefs=new HashMap<>();Map<UUID,JsonNode> items=new HashMap<>();
        for(var order:checkout.orders()){
            var kitchen=catalog.getKitchen(order.kitchenId());
            if(kitchen==null || !order.kitchenId().equals(kitchen.id()) || kitchen.identityId()==null)throw new IllegalStateException("Authoritative kitchen owner is unavailable");
            if(order.deliveryAddress()==null)throw new IllegalStateException("Delivery jurisdiction is missing");
            String pickup=state(kitchen.state()),dropoff=state(order.deliveryAddress().state());
            chefs.put(order.id(),kitchen.identityId());
            var input=requested.addObject().put("chefOrderId",order.id().toString()).put("chefIdentityId",kitchen.identityId().toString()).put("kitchenId",order.kitchenId().toString())
                .put("pickupStateCode",pickup).put("dropoffStateCode",dropoff).put("deliveryBeforeTax",money(order.deliveryFee()));
            var array=input.putArray("items");
            for(var item:order.items())array.addObject().put("menuItemId",item.menuItemId().toString()).put("quantity",item.quantity()).put("chefBaseUnit",money(item.unitPrice())).put("customerUnit",money(item.unitPrice()));
            // Current catalog has one published price. Explicitly snapshot equal bases; do not invent an uplift or infer historical prices later.
            items.put(order.id(),array);
        }
        JsonNode response=finance.quote(request);
        if(!checkout.id().toString().equals(response.path("checkoutId").asText()) || !hash(request).equals(response.path("requestHash").asText()) || !response.path("snapshots").isArray()
            || response.path("snapshots").size()!=checkout.orders().size())throw new IllegalStateException("Finance quote context does not match this checkout");
        var seen=new HashSet<UUID>();BigDecimal food=BigDecimal.ZERO,platform=BigDecimal.ZERO,tax=BigDecimal.ZERO,delivery=BigDecimal.ZERO,total=BigDecimal.ZERO;
        for(JsonNode snapshot:response.path("snapshots")){
            UUID orderId=UUID.fromString(snapshot.path("chefOrderId").asText());
            ObjectNode unsigned=snapshot.deepCopy();unsigned.remove("hash");
            if(!seen.add(orderId) || !chefs.containsKey(orderId) || !hash(unsigned).equals(snapshot.path("hash").asText())
                || !chefs.get(orderId).toString().equals(snapshot.path("chefIdentityId").asText())
                || !checkout.id().toString().equals(snapshot.path("checkoutId").asText()) || !checkout.customerIdentityId().toString().equals(snapshot.path("customerIdentityId").asText())
                || !"INR".equals(snapshot.path("currency").asText()) || !"ON_DEMAND".equals(snapshot.path("orderSource").asText()) || !items.get(orderId).equals(snapshot.path("items")))
                throw new IllegalStateException("Immutable financial snapshot identity, prices or hash mismatch");
            var order=checkout.orders().stream().filter(o->o.id().equals(orderId)).findFirst().orElseThrow();
            if(!order.kitchenId().toString().equals(snapshot.path("kitchenId").asText()) || amount(snapshot,"customerFood").compareTo(order.foodSubtotal())!=0 || amount(snapshot,"chefGross").compareTo(order.foodSubtotal())!=0
                || amount(snapshot,"delivery").compareTo(order.deliveryFee())!=0 || amount(snapshot,"customerTotal").compareTo(amount(snapshot,"customerFood").add(amount(snapshot,"platform")).add(amount(snapshot,"delivery")).add(amount(snapshot,"customerTax")))!=0)
                throw new IllegalStateException("Finance quote changed the selected food or delivery base");
            if(jdbc.update("UPDATE order_schema.customer_order SET chef_identity_id=?,platform_fee=?,tax_amount=?,grand_total=?,updated_at=now() WHERE id=? AND checkout_id=? AND customer_identity_id=? AND status='PAYMENT_PENDING'",
                chefs.get(orderId),amount(snapshot,"platform"),amount(snapshot,"customerTax"),amount(snapshot,"customerTotal"),orderId,checkout.id(),checkout.customerIdentityId())!=1)
                throw new IllegalStateException("Checkout is no longer bindable");
            food=food.add(amount(snapshot,"customerFood"));platform=platform.add(amount(snapshot,"platform"));tax=tax.add(amount(snapshot,"customerTax"));delivery=delivery.add(amount(snapshot,"delivery"));total=total.add(amount(snapshot,"customerTotal"));
        }
        if(total.compareTo(amount(response,"total"))!=0)throw new IllegalStateException("Child financial allocations do not equal checkout total");
        if(jdbc.update("UPDATE order_schema.checkout SET food_subtotal=?,platform_fee=?,tax_amount=?,delivery_fee=?,grand_total=?,updated_at=now() WHERE id=? AND customer_identity_id=? AND status='PAYMENT_PENDING'",
            food,platform,tax,delivery,total,checkout.id(),checkout.customerIdentityId())!=1)throw new IllegalStateException("Checkout financial binding was lost");
        for(JsonNode snapshot:response.path("snapshots"))jdbc.update("INSERT INTO order_schema.order_financial_snapshot(chef_order_id,snapshot_id,snapshot_hash,payload) VALUES (?,?,?,CAST(? AS jsonb))",
            UUID.fromString(snapshot.path("chefOrderId").asText()),UUID.fromString(snapshot.path("snapshotId").asText()),snapshot.path("hash").asText(),snapshot.toString());
    }
    public boolean hasSnapshot(UUID checkout){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.order_financial_snapshot s JOIN order_schema.customer_order o ON o.id=s.chef_order_id WHERE o.checkout_id=?)",Boolean.class,checkout));}
    static String state(String value){if(value!=null && java.util.Set.of("36","TELANGANA","TS","TG").contains(value.trim().toUpperCase(java.util.Locale.ROOT)))return "36";throw new IllegalArgumentException("Only reviewed Telangana tax jurisdiction is enabled in the launch source");}
    static String money(BigDecimal value){if(value==null || value.signum()<0)throw new IllegalArgumentException("Nonnegative source money required");return value.setScale(2,RoundingMode.UNNECESSARY).toPlainString();}
    static BigDecimal amount(JsonNode value,String field){if(!value.path(field).isTextual() || !value.path(field).asText().matches("[0-9]{1,14}\\.[0-9]{2}"))throw new IllegalArgumentException("Invalid finance amount");return new BigDecimal(value.path(field).asText());}
    private String hash(JsonNode value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical(value).toString().getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private JsonNode canonical(JsonNode value){if(value.isObject()){var result=json.createObjectNode();var keys=new TreeSet<String>();value.fieldNames().forEachRemaining(keys::add);for(String k:keys)result.set(k,canonical(value.get(k)));return result;}if(value.isArray()){var result=json.createArrayNode();for(JsonNode item:value)result.add(canonical(item));return result;}return value;}
}
