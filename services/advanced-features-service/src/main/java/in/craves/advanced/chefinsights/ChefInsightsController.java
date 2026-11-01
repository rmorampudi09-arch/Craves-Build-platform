package in.craves.advanced.chefinsights;

import in.craves.advanced.chefinsights.ChefInsightsDtos.ChefInsightsSummary;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A chef's own sales, orders and dishes over a period; Order service decides which kitchen the token belongs to. */
@RestController
@RequestMapping("/api/v1/advanced/chef-insights")
public class ChefInsightsController {
    private final ChefInsightsService service;

    public ChefInsightsController(ChefInsightsService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public ResponseEntity<ChefInsightsSummary> chefInsightsSummary(@RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                                   @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.summary(CurrentUser.bearerToken(), from, to));
    }
}
