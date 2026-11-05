package in.craves.integration.fleet.slots;

import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.fleet.slots.FleetSlotBookingService.CapacityInput;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The slot capacity console (admin-fleet-v1 /slot-capacity, app 1.3.3 R-07): the planned windows with their bookings,
 * approve one so riders can book it, or set its places and rate. Reads for support and audit too.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet/slot-capacity")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSlotCapacityController {
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final String[] OPERATORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};

    private final FleetSlotBookingService slots;

    public FleetSlotCapacityController(FleetSlotBookingService slots) {
        this.slots = slots;
    }

    @GetMapping
    public ResponseEntity<Object> list(@AuthenticationPrincipal CravesPrincipal principal,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        FleetAdminController.admin(principal, READERS);
        return json(200, slots.capacities(from, to));
    }

    @PostMapping("/{capacityId}/approve")
    public ResponseEntity<Object> approve(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader("Idempotency-Key") UUID key,
                                          @PathVariable UUID capacityId) {
        return json(200, slots.approve(FleetAdminController.admin(principal, OPERATORS), key, capacityId));
    }

    @PutMapping("/{capacityId}")
    public ResponseEntity<Object> adjust(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader("Idempotency-Key") UUID key,
                                         @PathVariable UUID capacityId, @RequestBody CapacityInput body) {
        return json(200, slots.adjust(FleetAdminController.admin(principal, OPERATORS), key, capacityId, body));
    }

    private static ResponseEntity<Object> json(int status, Object body) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(body);
    }
}
