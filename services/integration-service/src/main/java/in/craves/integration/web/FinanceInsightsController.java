package in.craves.integration.web;

import in.craves.integration.finance.insights.FinanceInsightsService;
import in.craves.integration.security.CravesPrincipal;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The admin Finance screens' reads. GET only: nothing under this path changes money or settings. */
@RestController
@RequestMapping("/api/v1/admin/finance/insights")
public class FinanceInsightsController {
    private final FinanceInsightsService insights;
    public FinanceInsightsController(FinanceInsightsService insights) { this.insights = insights; }

    @GetMapping("/overview")
    public ResponseEntity<FinanceInsightsService.Overview> overview(@AuthenticationPrincipal CravesPrincipal actor,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return noStore(insights.overview(actor, from, to));
    }

    @GetMapping("/transactions")
    public ResponseEntity<FinanceInsightsService.MovementPage> transactions(@AuthenticationPrincipal CravesPrincipal actor,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String kind, @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID party, @RequestParam(required = false) String search,
            @RequestParam(required = false) String cursor, @RequestParam(defaultValue = "50") int limit) {
        return noStore(insights.movements(actor, from, to, kind, status, party, search, cursor, limit));
    }

    @GetMapping("/orders/{checkoutId}")
    public ResponseEntity<FinanceInsightsService.OrderTrail> order(@AuthenticationPrincipal CravesPrincipal actor, @PathVariable UUID checkoutId) {
        return noStore(insights.order(actor, checkoutId));
    }

    @GetMapping("/payouts/{payoutId}")
    public ResponseEntity<FinanceInsightsService.PayoutTrail> payout(@AuthenticationPrincipal CravesPrincipal actor, @PathVariable UUID payoutId) {
        return noStore(insights.payout(actor, payoutId));
    }

    @GetMapping("/chefs")
    public ResponseEntity<FinanceInsightsService.ChefBalances> chefs(@AuthenticationPrincipal CravesPrincipal actor) {
        return noStore(insights.chefs(actor));
    }

    private static <T> ResponseEntity<T> noStore(T body) { return ResponseEntity.ok().header("Cache-Control", "no-store").body(body); }
}
