package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.rider.FleetRiderModels.AcceptTerms;
import in.craves.integration.fleet.rider.FleetRiderModels.Terms;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The rider app's API (contracts/openapi/rider-v1.yaml). WebSecurityConfiguration requires the RIDER role on
 * every route here except GET /me. Off unless CRAVES_FLEET_RIDER_API_ENABLED.
 */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetRiderController {
    private final FleetRiderService service;

    public FleetRiderController(FleetRiderService service) {
        this.service = service;
    }

    @GetMapping("/terms")
    public ResponseEntity<Terms> terms(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(service.terms(identity(principal)));
    }

    @PostMapping("/terms/accept")
    public ResponseEntity<Void> acceptTerms(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody AcceptTerms body) {
        service.acceptTerms(identity(principal), body.version());
        return ResponseEntity.noContent().build();
    }

    static UUID identity(CravesPrincipal principal) {
        if (principal == null || principal.identityId() == null) {
            throw new FleetApiException(401, "SIGN_IN_REQUIRED", "Sign in again.");
        }
        return principal.identityId();
    }

    static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
