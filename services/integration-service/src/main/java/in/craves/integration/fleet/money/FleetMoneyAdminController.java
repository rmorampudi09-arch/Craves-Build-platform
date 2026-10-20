package in.craves.integration.fleet.money;

import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.fleet.money.FleetMoneyModels.HoldInput;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Ops console money (admin-fleet-v1 /holds). Each operation checks its own scoped admin roles; mutations are idempotent and audited. */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetMoneyAdminController {
    private static final String[] HOLD_READERS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"};
    private static final String[] PAYMENTS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN"};
    private static final String KEY = "Idempotency-Key";

    private final FleetEarnings earnings;

    public FleetMoneyAdminController(FleetEarnings earnings) {
        this.earnings = earnings;
    }

    @GetMapping("/holds")
    public ResponseEntity<Object> holds(@AuthenticationPrincipal CravesPrincipal principal,
                                        @RequestParam(defaultValue = "ACTIVE") String state) {
        FleetAdminController.admin(principal, HOLD_READERS);
        return json(200, earnings.holds(state));
    }

    @PostMapping("/holds")
    public ResponseEntity<Object> placeHold(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                            @RequestBody HoldInput body) {
        return json(201, earnings.placeHold(FleetAdminController.admin(principal, PAYMENTS), key, body));
    }

    @PostMapping("/holds/{holdId}/release")
    public ResponseEntity<Object> releaseHold(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                              @PathVariable UUID holdId) {
        return json(200, earnings.releaseHold(FleetAdminController.admin(principal, PAYMENTS), key, holdId));
    }

    static ResponseEntity<Object> json(int status, Object body) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(body);
    }
}
