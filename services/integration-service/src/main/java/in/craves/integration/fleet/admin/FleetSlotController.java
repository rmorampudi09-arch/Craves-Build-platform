package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.admin.FleetAdminModels.ReasonInput;
import in.craves.integration.fleet.admin.FleetSlotService.SlotInput;
import in.craves.integration.security.CravesPrincipal;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.format.annotation.DateTimeFormat;
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

/** Ops-assigned slots (admin-fleet-v1 /slots). Reads for support and audit too; booking and cancelling for operations. */
@RestController
@RequestMapping("/api/v1/admin/fleet/slots")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSlotController {
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final String[] OPERATORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};

    private final FleetSlotService slots;

    public FleetSlotController(FleetSlotService slots) {
        this.slots = slots;
    }

    @GetMapping
    public ResponseEntity<Object> list(@AuthenticationPrincipal CravesPrincipal principal,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                       @RequestParam(required = false) UUID riderId) {
        FleetAdminController.admin(principal, READERS);
        return json(200, slots.list(from, to, riderId));
    }

    @PostMapping
    public ResponseEntity<Object> create(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader("Idempotency-Key") UUID key,
                                         @RequestBody SlotInput body) {
        return json(201, slots.create(FleetAdminController.admin(principal, OPERATORS), key, body));
    }

    @PostMapping("/{slotId}/cancel")
    public ResponseEntity<Object> cancel(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader("Idempotency-Key") UUID key,
                                         @PathVariable UUID slotId, @RequestBody ReasonInput body) {
        return json(200, slots.cancel(FleetAdminController.admin(principal, OPERATORS), key, slotId, body.reason()));
    }

    private static ResponseEntity<Object> json(int status, Object body) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(body);
    }
}
