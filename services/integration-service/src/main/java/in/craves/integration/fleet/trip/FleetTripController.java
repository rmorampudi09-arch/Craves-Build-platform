package in.craves.integration.fleet.trip;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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

    /** The trip in progress, or 204. */
    @GetMapping("/trips/active")
    public ResponseEntity<Trip> active(@AuthenticationPrincipal CravesPrincipal principal) {
        return trips.active(identity(principal)).map(FleetTripController::noStore)
            .orElseGet(() -> ResponseEntity.noContent().header("Cache-Control", "no-store").build());
    }

    /**
     * One trip step: arrived-pickup, food-not-ready, picked-up and arrived-drop take no body; delivered takes
     * {method: OTP, otp}; failed takes {reason, note}. 409 when the step is out of order or the trip has ended.
     */
    @PostMapping("/trips/{tripId}/{action}")
    public ResponseEntity<Trip> step(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID tripId,
                                     @PathVariable String action, @RequestHeader(KEY) String key,
                                     @RequestBody(required = false) StepBody body) {
        UUID identity = identity(principal);
        String idempotencyKey = key(key);
        return noStore(switch (action) {
            case "delivered" -> {
                if (body == null || !"OTP".equals(body.method())) {
                    throw FleetApiException.invalid("Send the customer's OTP, or the photo once the customer can't be reached.");
                }
                yield trips.deliveredByOtp(identity, tripId, body.otp(), idempotencyKey);
            }
            case "failed" -> trips.failed(identity, tripId, body == null ? null : body.reason(), body == null ? null : body.note(),
                idempotencyKey);
            default -> trips.step(identity, tripId, action, idempotencyKey);
        });
    }

    /** delivered with method PHOTO (multipart): after two calls and the wait, or once the OTP is locked; pay held for ops. */
    @PostMapping(path = "/trips/{tripId}/delivered", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Trip> deliveredByPhoto(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID tripId,
                                                 @RequestHeader(KEY) String key, @RequestParam("method") String method,
                                                 @RequestParam(value = "callsMade", required = false) Integer callsMade,
                                                 @RequestPart(value = "photo", required = false) MultipartFile photo) {
        if (!"PHOTO".equals(method)) {
            throw FleetApiException.invalid("Send method PHOTO with the photo.");
        }
        return noStore(trips.deliveredByPhoto(identity(principal), tripId, callsMade, photo, key(key)));
    }

    /** The JSON bodies of a step (rider-v1): delivered {method, otp, fix} or failed {reason, note}. */
    public record StepBody(String method, String otp, String reason, String note) {
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
