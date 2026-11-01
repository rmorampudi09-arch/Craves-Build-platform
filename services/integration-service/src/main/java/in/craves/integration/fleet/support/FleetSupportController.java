package in.craves.integration.fleet.support;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.fleet.support.FleetSupportModels.IssueInput;
import in.craves.integration.fleet.support.FleetSupportModels.SosInput;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The rider's "Report a problem" and SOS (rider-v1). RIDER only (WebSecurityConfiguration); off unless CRAVES_FLEET_RIDER_API_ENABLED. */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetSupportController {
    private final FleetRiderService riders;
    private final FleetSupportService support;

    public FleetSupportController(FleetRiderService riders, FleetSupportService support) {
        this.riders = riders;
        this.support = support;
    }

    /** Support acknowledges within 24 hours and fixes within 72. */
    @PostMapping("/support/issues")
    public ResponseEntity<Void> report(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody IssueInput body) {
        support.report(rider(principal), body);
        return ResponseEntity.noContent().build();
    }

    /** 204 once the press is stored; the ops lead is alerted with the rider's last location. A body is optional. */
    @PostMapping("/sos")
    public ResponseEntity<Void> sos(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody(required = false) SosInput body) {
        support.sos(rider(principal), body);
        return ResponseEntity.noContent().build();
    }

    private UUID rider(CravesPrincipal principal) {
        if (principal == null || principal.identityId() == null) {
            throw new FleetApiException(401, "SIGN_IN_REQUIRED", "Sign in again.");
        }
        return riders.riderId(principal.identityId());
    }
}
