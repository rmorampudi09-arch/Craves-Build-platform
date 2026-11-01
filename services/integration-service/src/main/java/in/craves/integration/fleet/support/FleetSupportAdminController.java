package in.craves.integration.fleet.support;

import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.fleet.support.FleetSupportModels.FixInput;
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

/**
 * Riders' issues and SOS presses in the ops console (admin-fleet-v1 /support-issues, /sos-events). Audit admins read;
 * support and operations admins acknowledge and fix issues.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSupportAdminController {
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final String[] HANDLERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN"};
    private static final String KEY = "Idempotency-Key";

    private final FleetSupportService support;

    public FleetSupportAdminController(FleetSupportService support) {
        this.support = support;
    }

    @GetMapping("/support-issues")
    public ResponseEntity<Object> issues(@AuthenticationPrincipal CravesPrincipal principal, @RequestParam(defaultValue = "OPEN") String state) {
        FleetAdminController.admin(principal, READERS);
        return json(support.issues(state));
    }

    @PostMapping("/support-issues/{issueId}/acknowledge")
    public ResponseEntity<Object> acknowledge(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                              @PathVariable UUID issueId) {
        return json(support.acknowledge(FleetAdminController.admin(principal, HANDLERS), key, issueId));
    }

    @PostMapping("/support-issues/{issueId}/fix")
    public ResponseEntity<Object> fix(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                      @PathVariable UUID issueId, @RequestBody FixInput body) {
        return json(support.fix(FleetAdminController.admin(principal, HANDLERS), key, issueId, body == null ? null : body.resolution()));
    }

    @GetMapping("/sos-events")
    public ResponseEntity<Object> sosEvents(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, READERS);
        return json(support.sosEvents());
    }

    private static ResponseEntity<Object> json(Object body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
