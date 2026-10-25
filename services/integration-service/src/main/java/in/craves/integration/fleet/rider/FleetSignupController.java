package in.craves.integration.fleet.rider;

import static in.craves.integration.fleet.rider.FleetRiderController.identity;
import static in.craves.integration.fleet.rider.FleetRiderController.noStore;

import in.craves.integration.fleet.rider.FleetRiderModels.PayoutAccountInput;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderMe;
import in.craves.integration.fleet.rider.FleetRiderModels.SignUp;
import in.craves.integration.security.CravesPrincipal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Rider sign-up from the app (rider-v1.yaml). A signed-in identity, no RIDER role: see WebSecurityConfiguration. */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetSignupController {
    private final FleetSignupService service;

    public FleetSignupController(FleetSignupService service) {
        this.service = service;
    }

    @PostMapping("/apply")
    public ResponseEntity<RiderMe> apply(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody SignUp body) {
        identity(principal);
        return noStore(service.signUp(principal, body));
    }

    @PostMapping("/payout-account")
    public ResponseEntity<Void> payoutAccount(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody PayoutAccountInput body) {
        service.submitPayoutAccount(identity(principal), body);
        return ResponseEntity.noContent().build();
    }
}
