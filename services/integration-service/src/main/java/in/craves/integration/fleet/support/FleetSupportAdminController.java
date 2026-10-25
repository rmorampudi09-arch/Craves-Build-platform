package in.craves.integration.fleet.support;

import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.security.CravesPrincipal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Riders' issues and SOS presses in the ops console (admin-fleet-v1 /support-issues, /sos-events). */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSupportAdminController {
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};

    private final FleetSupportService support;

    public FleetSupportAdminController(FleetSupportService support) {
        this.support = support;
    }

    @GetMapping("/support-issues")
    public ResponseEntity<Object> issues(@AuthenticationPrincipal CravesPrincipal principal, @RequestParam(defaultValue = "OPEN") String state) {
        FleetAdminController.admin(principal, READERS);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(support.issues(state));
    }

    @GetMapping("/sos-events")
    public ResponseEntity<Object> sosEvents(@AuthenticationPrincipal CravesPrincipal principal) {
        FleetAdminController.admin(principal, READERS);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(support.sosEvents());
    }
}
