package in.craves.integration.web;

import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
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
@RequestMapping("/api/v1/document-sources/chef")
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=15)
public class ChefDocumentSourceController {
    private final JdbcTemplate jdbc;private final boolean enabled;
    public ChefDocumentSourceController(JdbcTemplate jdbc,@Value("${CRAVES_DOCUMENTS_SOURCES_ENABLED:false}") boolean enabled){this.jdbc=jdbc;this.enabled=enabled;}
    @GetMapping("/earnings")
    public ResponseEntity<Map<String,Object>> earnings(@AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam Instant from,@RequestParam Instant to,@RequestParam(defaultValue="INR") String currency,
        @RequestParam(defaultValue="Asia/Kolkata") String timezone) {
        validate(principal,from,to,currency,timezone);
        var entries=jdbc.query("SELECT id,order_id,created_at,status,gross_amount,commission_amount,tax_withheld_amount,adjustment_amount,net_payable FROM payment_schema.chef_earning_entry WHERE chef_identity_id=? AND created_at>=? AND created_at<? AND currency=? ORDER BY created_at,id LIMIT 1001",
            (rs,n)->new Earning(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getTimestamp(3).toInstant(),rs.getString(4),rs.getBigDecimal(5),rs.getBigDecimal(6),rs.getBigDecimal(7),rs.getBigDecimal(8),rs.getBigDecimal(9)),principal.identityId(),Timestamp.from(from),Timestamp.from(to),currency);
        bounded(entries.size());List<List<String>> rows=new ArrayList<>();Map<String,BigDecimal[]> groups=new TreeMap<>();
        for(Earning entry:entries) {
            rows.add(List.of(entry.id().toString(),entry.order().toString(),entry.status(),money(entry.gross()),money(entry.commission()),money(entry.tax()),money(entry.adjustment()),money(entry.net())));
            BigDecimal[] sums=groups.computeIfAbsent(entry.status(),ignored->new BigDecimal[]{BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO});
            BigDecimal[] amounts={entry.gross(),entry.commission(),entry.tax(),entry.adjustment(),entry.net()};for(int i=0;i<sums.length;i++)sums[i]=sums[i].add(amounts[i]);
        }
        List<List<String>> totals=new ArrayList<>();groups.forEach((status,values)->totals.add(List.of(status,money(values[0]),money(values[1]),money(values[2]),money(values[3]),money(values[4]))));
        var tables=new ArrayList<Map<String,Object>>();
        tables.add(table("Legacy recorded entries ("+currency+")",List.of("Entry ID","Order ID","Status","Gross","Commission","Withheld tax","Adjustment","Net recorded"),rows));
        tables.add(table("Legacy totals kept separate by recorded status",List.of("Status","Gross","Commission","Withheld tax","Adjustment","Net recorded"),totals));
        tables.addAll(LedgerStatementTables.read(jdbc,principal.identityId(),from,to,currency,timezone,true));LedgerStatementTables.checkTotal(tables);
        return response(snapshot("CHEF_EARNINGS_STATEMENT",principal.identityId(),from,to,currency,timezone,tables,
            "This dated source snapshot includes legacy allocations separately from delivered earnings in the new journal. Legacy DRAFT/APPROVED/SETTLEMENT_PENDING/SETTLED/REVERSED rows are not an available balance. New earnings show the original fee, GST on that fee and independently reviewed withholding. Customer restaurant GST under section 9(5) is Craves' liability and is not deducted again from the chef's food earnings. New-ledger opening and closing amounts use posted CHEF_PAYABLE movements only; they do not invent pre-cutover balances. Holds and payment reservations affect withdrawal availability, not whether the liability exists. Not a GST tax invoice."));
    }
    @GetMapping("/settlements")
    public ResponseEntity<Map<String,Object>> settlements(@AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam Instant from,@RequestParam Instant to,@RequestParam(defaultValue="INR") String currency,
        @RequestParam(defaultValue="Asia/Kolkata") String timezone) {
        validate(principal,from,to,currency,timezone);
        var allocations=jdbc.query("SELECT i.batch_id,i.earning_entry_id,i.created_at,i.amount,b.batch_reference,b.status FROM payment_schema.chef_settlement_item i JOIN payment_schema.chef_settlement_batch b ON b.id=i.batch_id WHERE i.chef_identity_id=? AND i.created_at>=? AND i.created_at<? AND b.currency=? ORDER BY i.created_at,i.batch_id,i.earning_entry_id LIMIT 1001",
            (rs,n)->new Allocation(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getTimestamp(3).toInstant(),rs.getBigDecimal(4),rs.getString(5),rs.getString(6)),principal.identityId(),Timestamp.from(from),Timestamp.from(to),currency);
        bounded(allocations.size());List<List<String>> rows=new ArrayList<>();Map<String,BigDecimal> groups=new TreeMap<>();
        for(Allocation allocation:allocations){rows.add(List.of(allocation.reference(),allocation.entry().toString(),date(allocation.created(),timezone),allocation.status(),money(allocation.amount())));groups.merge(allocation.status(),allocation.amount(),BigDecimal::add);}
        List<List<String>> totals=new ArrayList<>();groups.forEach((status,amount)->totals.add(List.of(status,money(amount))));
        var tables=new ArrayList<Map<String,Object>>();tables.add(table("Your legacy settlement allocations ("+currency+")",List.of("Batch reference","Earning entry","Allocated","Batch status","Your allocation"),rows));
        tables.add(table("Your legacy allocations by batch status",List.of("Status","Amount"),totals));
        tables.addAll(LedgerStatementTables.read(jdbc,principal.identityId(),from,to,currency,timezone,false));LedgerStatementTables.checkTotal(tables);
        return response(snapshot("CHEF_SETTLEMENT_STATEMENT",principal.identityId(),from,to,currency,timezone,tables,
            "Only your allocations and instructions are included; other chefs' money and banking details are excluded. Legacy batch status is not independent proof of bank credit. New payout instructions retain the original amount and matching settlement or reversal journal evidence. RESERVED, PROCESSING and UNKNOWN are not PAID. Instruction selection uses creation time; the separate liability reconciliation uses journal posting time. A linked reversal restores liability without deleting the original transfer. Closing outstanding is not the same as available to withdraw. This statement does not initiate a payout and is not a GST tax invoice."));
    }
    private void validate(CravesPrincipal principal,Instant from,Instant to,String currency,String timezone) {
        if(principal==null||principal.identityId()==null)throw error(401,"ACCESS_TOKEN_REQUIRED");if(!principal.hasRole("CHEF"))throw error(403,"CHEF_ROLE_REQUIRED");
        if(!enabled)throw error(503,"DOCUMENT_SOURCES_DISABLED");
        if(from==null||to==null||!from.isBefore(to)||Duration.between(from,to).compareTo(Duration.ofDays(32))>0)throw error(400,"INVALID_PERIOD");
        if(currency==null||!currency.matches("[A-Z]{3}"))throw error(400,"INVALID_CURRENCY");
        try{ZoneId.of(timezone);}catch(RuntimeException ex){throw error(400,"INVALID_TIMEZONE");}
    }
    static Map<String,Object> snapshot(String type,UUID owner,Instant from,Instant to,String currency,String zone,List<Map<String,Object>> tables,String notice){
        return Map.of("version",1,"type",type,"ownerIdentityId",owner,"reference",from+" / "+to,"currency",currency,"asOf",Instant.now(),
            "facts",List.of(Map.of("label","Period","value",date(from,zone)+" to "+date(to,zone)+" (end exclusive)")),"tables",tables,"notice",notice);
    }
    static Map<String,Object> table(String title,List<String> columns,List<List<String>> rows){return Map.of("title",title,"columns",columns,"rows",rows);}
    static void bounded(int count){if(count>1000)throw error(422,"STATEMENT_TOO_LARGE_REDUCE_PERIOD");}
    static String money(BigDecimal value){if(value==null)throw error(409,"SOURCE_AMOUNT_MISSING");return value.toPlainString();}
    static String date(Instant value,String zone){return DateTimeFormatter.ofPattern("dd MMM uuuu HH:mm",java.util.Locale.ENGLISH).withZone(ZoneId.of(zone)).format(value);}
    static ResponseStatusException error(int status,String code){return new ResponseStatusException(HttpStatus.valueOf(status),code);}
    static ResponseEntity<Map<String,Object>> response(Map<String,Object> data){return ResponseEntity.ok().header("Cache-Control","private, no-store, max-age=0").body(data);}
    private record Earning(UUID id,UUID order,Instant created,String status,BigDecimal gross,BigDecimal commission,BigDecimal tax,BigDecimal adjustment,BigDecimal net){}
    private record Allocation(UUID batch,UUID entry,Instant created,BigDecimal amount,String reference,String status){}
}
