package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.admin.FleetAdminModels.DispatchPolicyInput;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotNote;
import in.craves.integration.fleet.admin.FleetAdminModels.RateCardDraft;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The pilot zone from the console (admin-fleet-v1 setup, rate cards, dispatch policies and pilot paths): reads for
 * support and audit too, changes for operations.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSetupController {
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final String[] OPERATORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};
    private static final String KEY = "Idempotency-Key";

    private final FleetSetupService setup;

    public FleetSetupController(FleetSetupService setup) {
        this.setup = setup;
    }

    @GetMapping("/setup")
    public ResponseEntity<Object> getFleetSetup(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, READERS);
        return json(200, setup.setup());
    }

    @PostMapping("/rate-cards")
    public ResponseEntity<Object> createRateCardDraft(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                      @RequestBody RateCardDraft body) {
        return json(201, setup.createRateCardDraft(FleetAdminController.admin(principal, OPERATORS), key, body));
    }

    @PostMapping("/rate-cards/{version}/publish")
    public ResponseEntity<Object> publishRateCard(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                  @PathVariable String version) {
        return json(200, setup.publishRateCard(FleetAdminController.admin(principal, OPERATORS), key, version));
    }

    @PostMapping("/dispatch-policies")
    public ResponseEntity<Object> setDispatchPolicy(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                    @RequestBody DispatchPolicyInput body) {
        return json(201, setup.setDispatchPolicy(FleetAdminController.admin(principal, OPERATORS), key, body));
    }

    @PutMapping("/pilot/riders/{riderId}")
    public ResponseEntity<Object> addPilotRider(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                @PathVariable UUID riderId, @RequestBody(required = false) PilotNote body) {
        return json(200, setup.addPilotRider(FleetAdminController.admin(principal, OPERATORS), key, riderId, body));
    }

    @DeleteMapping("/pilot/riders/{riderId}")
    public ResponseEntity<Void> removePilotRider(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                 @PathVariable UUID riderId) {
        setup.removePilotRider(FleetAdminController.admin(principal, OPERATORS), key, riderId);
        return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }

    @PutMapping("/pilot/kitchens/{chefId}")
    public ResponseEntity<Object> addPilotKitchen(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                  @PathVariable UUID chefId, @RequestBody(required = false) PilotNote body) {
        return json(200, setup.addPilotKitchen(FleetAdminController.admin(principal, OPERATORS), key, chefId, body));
    }

    @DeleteMapping("/pilot/kitchens/{chefId}")
    public ResponseEntity<Void> removePilotKitchen(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                   @PathVariable UUID chefId) {
        setup.removePilotKitchen(FleetAdminController.admin(principal, OPERATORS), key, chefId);
        return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
    }

    private static ResponseEntity<Object> json(int status, Object body) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(body);
    }
}
