package in.craves.integration.web;

import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.security.CravesPrincipal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/finance/source-status")
public class FinanceSourceOperationsController {
    public record ExceptionView(UUID chefOrderId,String reason,Instant createdAt) {}
    public record State(String state,String lastResult,long count) {}
    public record Response(boolean finalizationEnabled,String activationNotice,List<State> states,long capturedCheckouts,long postedEarnings,List<ExceptionView> exceptions) {}
    private final JdbcTemplate jdbc;private final boolean enabled;
    public FinanceSourceOperationsController(JdbcTemplate jdbc,@Value("${CRAVES_FINANCE_FINALIZATION_ENABLED:false}") boolean enabled){this.jdbc=jdbc;this.enabled=enabled;}
    @GetMapping public Response status(@AuthenticationPrincipal CravesPrincipal actor){
        FinancePolicyService.reader(actor);
        var states=jdbc.query("SELECT state,coalesce(last_result,'UNPROCESSED'),count(*) FROM payment_schema.finance_order_binding GROUP BY state,last_result ORDER BY state,last_result",(rs,n)->new State(rs.getString(1),rs.getString(2),rs.getLong(3)));
        var exceptions=jdbc.query("SELECT chef_order_id,reason,created_at FROM payment_schema.finance_source_exception ORDER BY created_at DESC,id DESC LIMIT 100",(rs,n)->new ExceptionView(rs.getObject(1,UUID.class),rs.getString(2),rs.getTimestamp(3).toInstant()));
        return new Response(enabled,"Runtime counters are evidence of received source events, not a guarantee that all historical orders were imported.",states,
            jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_capture",Long.class),jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_earning_projection",Long.class),exceptions);
    }
}
