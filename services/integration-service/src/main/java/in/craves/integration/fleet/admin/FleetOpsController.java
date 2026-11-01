package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.admin.FleetAdminModels.ReasonInput;
import in.craves.integration.fleet.dispatch.FleetOpsService;
import in.craves.integration.fleet.dispatch.FleetOpsService.CodeCheckInput;
import in.craves.integration.fleet.dispatch.FleetOpsService.ReassignInput;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The ops console's live view (admin-fleet-v1 /trips, /dispatch-queue, /positions, /pilot-health, /code-checks). Trips,
 * the queue, pilot health and the code checks are read by support and audit too; positions, reassign, cancel and a code
 * check's outcome are for operations.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetOpsController {
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final String[] OPERATORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};
    private static final String KEY = "Idempotency-Key";

    private final FleetOpsService ops;
    private final FleetPilotHealth health;

    public FleetOpsController(FleetOpsService ops, FleetPilotHealth health) {
        this.ops = ops;
        this.health = health;
    }

    /** The pilot-health queries (PILOT-HEALTH.md), read-only with a time limit: for everyone who reads trips. */
    @GetMapping("/pilot-health")
    public ResponseEntity<Object> pilotHealth(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, READERS);
        return json(health.report());
    }

    @GetMapping("/trips")
    public ResponseEntity<Object> trips(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, READERS);
        return json(ops.trips());
    }

    @GetMapping("/dispatch-queue")
    public ResponseEntity<Object> dispatchQueue(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, READERS);
        return json(ops.dispatchQueue());
    }

    /** Live rider positions: operations only (contract x-roles). */
    @GetMapping("/positions")
    public ResponseEntity<Object> positions(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, OPERATORS);
        return json(ops.positions());
    }

    @PostMapping("/trips/{tripId}/reassign")
    public ResponseEntity<Object> reassign(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                           @PathVariable UUID tripId, @RequestBody ReassignInput body) {
        return json(ops.reassign(FleetAdminController.admin(principal, OPERATORS), key, tripId, body));
    }

    @PostMapping("/trips/{tripId}/cancel")
    public ResponseEntity<Object> cancel(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                         @PathVariable UUID tripId, @RequestBody ReasonInput body) {
        return json(ops.cancel(FleetAdminController.admin(principal, OPERATORS), key, tripId, body.reason()));
    }

    /** Refused delivery codes typed offline, waiting for ops to call the customer (decision E4). */
    @GetMapping("/code-checks")
    public ResponseEntity<Object> codeChecks(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, READERS);
        return json(ops.codeChecks());
    }

    @PostMapping("/trips/{tripId}/code-check")
    public ResponseEntity<Object> checkCode(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                            @PathVariable UUID tripId, @RequestBody CodeCheckInput body) {
        return json(ops.checkCode(FleetAdminController.admin(principal, OPERATORS), key, tripId, body));
    }

    private static ResponseEntity<Object> json(Object body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
