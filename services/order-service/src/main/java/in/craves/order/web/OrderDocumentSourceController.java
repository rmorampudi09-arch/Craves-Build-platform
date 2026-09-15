package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/document-sources")
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=15)
public class OrderDocumentSourceController {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public OrderDocumentSourceController(JdbcTemplate jdbc,@Value("${CRAVES_DOCUMENTS_SOURCES_ENABLED:false}") boolean enabled) {
        this.jdbc=jdbc; this.enabled=enabled;
    }
    @GetMapping("/orders/{id}")
    public ResponseEntity<Map<String,Object>> order(@AuthenticationPrincipal CravesPrincipal principal,@PathVariable UUID id,
        @RequestParam(defaultValue="false") boolean receipt,@RequestParam(defaultValue="INR") String currency,
        @RequestParam(defaultValue="Asia/Kolkata") String timezone) {
        require(principal,"CUSTOMER"); validate(currency,timezone);
        var orders=jdbc.query("SELECT o.id,o.order_source,o.kitchen_name_snapshot,o.status,o.currency,o.created_at,o.updated_at,"+
            "o.food_subtotal,o.platform_fee,o.tax_amount,o.delivery_fee,o.grand_total,o.dropoff_recipient_name,"+
            "o.dropoff_address_line1,o.dropoff_address_line2,o.dropoff_city,o.dropoff_postal_code,c.status AS checkout_status "+
            "FROM order_schema.customer_order o LEFT JOIN order_schema.checkout c ON c.id=o.checkout_id "+
            "AND c.customer_identity_id=o.customer_identity_id WHERE o.id=? AND o.customer_identity_id=?",
            (rs,n)->new OrderRow(rs.getObject("id",UUID.class),rs.getString("order_source"),rs.getString("kitchen_name_snapshot"),
                rs.getString("status"),rs.getString("currency").trim(),rs.getString("checkout_status"),
                rs.getTimestamp("created_at").toInstant(),rs.getBigDecimal("food_subtotal"),rs.getBigDecimal("platform_fee"),
                rs.getBigDecimal("tax_amount"),rs.getBigDecimal("delivery_fee"),rs.getBigDecimal("grand_total"),
                rs.getString("dropoff_recipient_name"),address(rs)),id,principal.identityId());
        if(orders.isEmpty()) throw error(404,"ORDER_NOT_FOUND");
        OrderRow order=orders.getFirst();
        if(!currency.equals(order.currency())) throw error(409,"DOCUMENT_CURRENCY_MISMATCH");
        if(receipt && (!"ON_DEMAND".equals(order.source())||!"PAID".equals(order.checkoutStatus())))
            throw error(409,"PAID_ON_DEMAND_CHECKOUT_REQUIRED");
        List<List<String>> items=jdbc.query("SELECT item_name_snapshot,quantity,unit_price_snapshot,line_total FROM order_schema.order_item "+
            "WHERE order_id=? ORDER BY created_at,id LIMIT 1001",(rs,n)->List.of(text(rs.getString(1)),Integer.toString(rs.getInt(2)),
                money(rs.getBigDecimal(3)),money(rs.getBigDecimal(4))),id);
        bounded(items.size());
        List<Map<String,String>> facts=List.of(field("Kitchen",text(order.kitchen())),field("Order status",order.status()),
            field("Placed",date(order.created(),timezone)),field("Recipient",text(order.recipient())),
            field("Saved delivery address",order.address()));
        List<List<String>> totals=List.of(List.of("Food subtotal",money(order.food())),List.of("Platform fee",money(order.platform())),
            List.of("Tax recorded on order",money(order.tax())),List.of("Delivery fee",money(order.delivery())),
            List.of("Recorded order total",money(order.total())));
        String note="This is "+(receipt?"a receipt based on the PAID checkout record":"an order summary, not proof of payment")+
            ". Amounts are copied from this chef-specific order, not repriced and not the total of a multi-chef checkout. "+
            "Current order/refund status is shown above; the original total is not an outstanding balance. Not a GST tax invoice. "+
            ("SUBSCRIPTION".equals(order.source())?"Subscription charges belong to the subscription invoice; no per-order allocation is inferred.":"");
        return response(snapshot(receipt?"PAYMENT_RECEIPT":"ORDER_SUMMARY",principal.identityId(),id.toString(),currency,facts,
            List.of(table("Order items",List.of("Item","Quantity","Unit price","Line total"),items),
                table("Recorded charges ("+currency+")",List.of("Charge","Amount"),totals)),note));
    }
    @GetMapping("/chef/orders")
    public ResponseEntity<Map<String,Object>> chef(@AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam Instant from,@RequestParam Instant to,@RequestParam(defaultValue="INR") String currency,
        @RequestParam(defaultValue="Asia/Kolkata") String timezone) {
        require(principal,"CHEF"); period(from,to); validate(currency,timezone);
        List<List<String>> rows=jdbc.query("SELECT id,kitchen_name_snapshot,created_at,status,order_source,grand_total "+
            "FROM order_schema.customer_order WHERE chef_identity_id=? AND created_at>=? AND created_at<? AND currency=? "+
            "ORDER BY created_at,id LIMIT 1001",(rs,n)->List.of(rs.getObject(1,UUID.class).toString(),text(rs.getString(2)),
                date(rs.getTimestamp(3).toInstant(),timezone),rs.getString(4),rs.getString(5),money(rs.getBigDecimal(6))),
            principal.identityId(),Timestamp.from(from),Timestamp.from(to),currency);
        bounded(rows.size());
        return response(snapshot("CHEF_ORDER_STATEMENT",principal.identityId(),from+" / "+to,currency,
            List.of(field("Period",date(from,timezone)+" to "+date(to,timezone)+" (end exclusive)"),field("Orders recorded",Integer.toString(rows.size()))),
            List.of(table("Order activity",List.of("Order ID","Kitchen","Placed","Status","Source","Order total"),rows)),
            "Order activity is not an earnings or payout statement. Totals are original customer order charges, not chef net earnings. "+
            "Cancelled, refunded and subscription orders retain their recorded status. Chef ownership uses the order-time snapshot. Not a GST tax invoice."));
    }
    private void require(CravesPrincipal principal,String role) {
        if(principal==null||principal.identityId()==null) throw error(401,"ACCESS_TOKEN_REQUIRED");
        if(!principal.hasRole(role)) throw error(403,"DOCUMENT_ROLE_REQUIRED");
        if(!enabled) throw error(503,"DOCUMENT_SOURCES_DISABLED");
    }
    static void period(Instant from,Instant to) {
        if(from==null||to==null||!from.isBefore(to)||Duration.between(from,to).compareTo(Duration.ofDays(32))>0)
            throw error(400,"INVALID_DOCUMENT_PERIOD");
    }
    static void validate(String currency,String timezone) {
        if(currency==null||!currency.matches("[A-Z]{3}")) throw error(400,"INVALID_CURRENCY");
        try { ZoneId.of(timezone); } catch(RuntimeException ex) { throw error(400,"INVALID_TIMEZONE"); }
    }
    static void bounded(int count) { if(count>1000) throw error(422,"STATEMENT_TOO_LARGE_REDUCE_PERIOD"); }
    static Map<String,Object> snapshot(String type,UUID owner,String ref,String currency,List<Map<String,String>> facts,
        List<Map<String,Object>> tables,String notice) {
        return Map.of("version",1,"type",type,"ownerIdentityId",owner,"reference",ref,"currency",currency,
            "asOf",Instant.now(),"facts",facts,"tables",tables,"notice",notice);
    }
    static Map<String,Object> table(String title,List<String> columns,List<List<String>> rows) { return Map.of("title",title,"columns",columns,"rows",rows); }
    static Map<String,String> field(String label,String value) { return Map.of("label",label,"value",value); }
    static String text(String value) { return value==null||value.isBlank()?"Not recorded":value; }
    static String money(BigDecimal value) { if(value==null) throw error(409,"SOURCE_AMOUNT_MISSING"); return value.toPlainString(); }
    static String date(Instant value,String zone) { return DateTimeFormatter.ofPattern("dd MMM uuuu HH:mm",java.util.Locale.ENGLISH).withZone(ZoneId.of(zone)).format(value); }
    private static String address(ResultSet rs) throws SQLException {
        List<String> fields=new ArrayList<>();
        for(String name:List.of("dropoff_address_line1","dropoff_address_line2","dropoff_city","dropoff_postal_code")) {
            String value=rs.getString(name); if(value!=null&&!value.isBlank()) fields.add(value);
        }
        return fields.isEmpty()?"Not recorded":String.join(", ",fields);
    }
    static ResponseStatusException error(int status,String code) { return new ResponseStatusException(HttpStatus.valueOf(status),code); }
    static ResponseEntity<Map<String,Object>> response(Map<String,Object> data) {
        return ResponseEntity.ok().header("Cache-Control","private, no-store, max-age=0").body(data);
    }
    private record OrderRow(UUID id,String source,String kitchen,String status,String currency,String checkoutStatus,Instant created,
        BigDecimal food,BigDecimal platform,BigDecimal tax,BigDecimal delivery,BigDecimal total,String recipient,String address) {}
}
