package in.craves.integration.fleet.trip;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Offers and trips of the rider API (contracts/openapi/rider-v1.yaml). WebSecurityConfiguration requires the RIDER role;
 * off unless CRAVES_FLEET_RIDER_API_ENABLED. Every POST carries an Idempotency-Key.
 */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetTripController {
    private static final String KEY = "Idempotency-Key";

    private final FleetTripService trips;

    public FleetTripController(FleetTripService trips) {
        this.trips = trips;
    }

    /** 200 Trip; 409 OFFER_TAKEN when another rider got it; 410 OFFER_EXPIRED. */
    @PostMapping("/offers/{offerId}/accept")
    public ResponseEntity<Trip> accept(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID offerId,
                                       @RequestHeader(KEY) String key) {
        return noStore(trips.accept(identity(principal), offerId, key(key)));
    }

    /** Free, no reason needed. */
    @PostMapping("/offers/{offerId}/decline")
    public ResponseEntity<Void> decline(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID offerId,
                                        @RequestHeader(KEY) String key) {
        key(key);
        trips.decline(identity(principal), offerId);
        return ResponseEntity.noContent().build();
    }

    static UUID identity(CravesPrincipal principal) {
        if (principal == null || principal.identityId() == null) {
            throw new FleetApiException(401, "SIGN_IN_REQUIRED", "Sign in again.");
        }
        return principal.identityId();
    }

    /** rider-{action}-{offerId or tripId}-{riderId}[-{attempt}] from the app; any short printable key is accepted. */
    static String key(String key) {
        if (key == null || key.isBlank() || key.length() > 128 || !key.matches("[A-Za-z0-9_.:-]+")) {
            throw new FleetApiException(400, "IDEMPOTENCY_KEY_REQUIRED", "Update the app and try again.");
        }
        return key;
    }

    static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
