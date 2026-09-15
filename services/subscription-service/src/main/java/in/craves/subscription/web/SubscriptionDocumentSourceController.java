package in.craves.subscription.web;

import in.craves.subscription.security.CurrentUser;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
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
@RequestMapping("/api/v1/document-sources/subscription-invoices")
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=15)
public class SubscriptionDocumentSourceController {
    private final JdbcTemplate jdbc;
    private final boolean enabled;
    public SubscriptionDocumentSourceController(JdbcTemplate jdbc,@Value("${CRAVES_DOCUMENTS_SOURCES_ENABLED:false}") boolean enabled) {
        this.jdbc=jdbc; this.enabled=enabled;
    }
    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> receipt(@AuthenticationPrincipal CurrentUser user,@PathVariable UUID id,
        @RequestParam(defaultValue="INR") String currency,@RequestParam(defaultValue="Asia/Kolkata") String timezone) {
        if(user==null||user.identityId()==null) throw error(401,"ACCESS_TOKEN_REQUIRED");
        if(!user.hasRole("CUSTOMER")) throw error(403,"CUSTOMER_ROLE_REQUIRED");
        if(!enabled) throw error(503,"DOCUMENT_SOURCES_DISABLED");
        if(!currency.matches("[A-Z]{3}")) throw error(400,"INVALID_CURRENCY");
        ZoneId zone;
        try { zone=ZoneId.of(timezone); } catch(RuntimeException ex) { throw error(400,"INVALID_TIMEZONE"); }
        var rows=jdbc.query("SELECT id,subscription_id,cycle_start,cycle_end,amount,currency,status,paid_at "+
            "FROM subscription_schema.subscription_invoice WHERE id=? AND customer_identity_id=?",(rs,n)-> {
                if(!currency.equals(rs.getString("currency").trim())) throw error(409,"DOCUMENT_CURRENCY_MISMATCH");
                if(!"PAID".equals(rs.getString("status")) || rs.getTimestamp("paid_at")==null) throw error(409,"PAID_SUBSCRIPTION_INVOICE_REQUIRED");
                String paid=DateTimeFormatter.ofPattern("dd MMM uuuu HH:mm z",java.util.Locale.ENGLISH).withZone(zone).format(rs.getTimestamp("paid_at").toInstant());
                List<Map<String,String>> facts=List.of(field("Subscription",rs.getObject("subscription_id",UUID.class).toString()),
                    field("Invoice status","PAID"),field("Paid at",paid),field("Billing cycle",rs.getDate("cycle_start")+" to "+rs.getDate("cycle_end")+" (end exclusive)"));
                List<Map<String,Object>> tables=List.of(Map.of("title","Recorded subscription charge ("+currency+")",
                    "columns",List.of("Charge","Amount"),"rows",List.of(List.of("Paid invoice amount",rs.getBigDecimal("amount").toPlainString()))));
                return Map.<String,Object>of("version",1,"type","SUBSCRIPTION_RECEIPT","ownerIdentityId",user.identityId(),
                    "reference",id.toString(),"currency",currency,"asOf",Instant.now(),"facts",facts,"tables",tables,
                    "notice","This receipt uses the immutable subscription invoice amount and recorded paid status. Current plan prices are not substituted. "+
                    "The amount is not allocated across individual meals or chefs by this generator. Not a GST tax invoice or a credit note.");
            },id,user.identityId());
        if(rows.isEmpty()) throw error(404,"SUBSCRIPTION_INVOICE_NOT_FOUND");
        return ResponseEntity.ok().header("Cache-Control","private, no-store, max-age=0").body(rows.getFirst());
    }
    static Map<String,String> field(String label,String value) { return Map.of("label",label,"value",value); }
    static ResponseStatusException error(int status,String code) { return new ResponseStatusException(HttpStatus.valueOf(status),code); }
}
