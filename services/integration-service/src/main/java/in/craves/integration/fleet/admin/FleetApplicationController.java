package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.admin.FleetAdminModels.ApplicationDecision;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ops's one decision on a rider's application, contracts/openapi/admin-fleet-v1.yaml (docs/riders/FLOWS.md): operations
 * admins decide; confirming the payout account in the same decision also needs a payments role, as confirming it alone does.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetApplicationController {
    private static final String[] OPERATORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};
    private static final String[] PAYMENTS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN"};

    private final FleetApplicationService applications;

    public FleetApplicationController(FleetApplicationService applications) {
        this.applications = applications;
    }

    @PostMapping("/riders/{riderId}/application/decision")
    public ResponseEntity<Object> decide(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader("Idempotency-Key") UUID key,
                                         @PathVariable UUID riderId, @RequestBody ApplicationDecision body) {
        FleetAdminModels.Admin admin = FleetAdminController.admin(principal, OPERATORS);
        return ResponseEntity.ok().header("Cache-Control", "no-store")
            .body(applications.decide(admin, principal.hasAnyRole(PAYMENTS), key, riderId, body));
    }
}
