package in.craves.integration.fleet.slots;

import in.craves.integration.fleet.rider.FleetRiderController;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.fleet.slots.FleetSlotBookingService.Booking;
import in.craves.integration.fleet.slots.FleetSlotBookingService.SlotsPage;
import in.craves.integration.fleet.slots.FleetSlotBookingService.Standby;
import in.craves.integration.security.CravesPrincipal;
import java.time.Instant;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Booked peak slots for the rider app (rider-v1 /slots, app 1.3.3 R-07 and R-08). */
@RestController
@RequestMapping("/api/v1/rider/slots")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetSlotBookingController {
    private final FleetSlotBookingService slots;
    private final FleetRiderService riders;

    public FleetSlotBookingController(FleetSlotBookingService slots, FleetRiderService riders) {
        this.slots = slots;
        this.riders = riders;
    }

    @GetMapping
    public ResponseEntity<SlotsPage> list(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(slots.list(rider(principal), Instant.now()));
    }

    @PostMapping("/{capacityId}/book")
    public ResponseEntity<Booking> book(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID capacityId) {
        return noStore(slots.book(rider(principal), capacityId, Instant.now()));
    }

    @PostMapping("/{capacityId}/standby")
    public ResponseEntity<Standby> standby(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID capacityId) {
        return noStore(slots.standby(rider(principal), capacityId, Instant.now()));
    }

    @DeleteMapping("/bookings/{bookingId}")
    public ResponseEntity<Booking> cancel(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID bookingId) {
        return noStore(slots.cancel(rider(principal), bookingId, Instant.now()));
    }

    private UUID rider(CravesPrincipal principal) {
        return riders.riderId(FleetRiderController.riderIdentity(principal));
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
