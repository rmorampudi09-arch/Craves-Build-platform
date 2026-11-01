package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.rider.FleetRiderController;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import in.craves.integration.fleet.rider.FleetShiftService;
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import in.craves.integration.fleet.trip.FleetTripService.Tap;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
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
 * off unless CRAVES_FLEET_RIDER_API_ENABLED. Every POST carries an Idempotency-Key. With
 * craves.fleet.trip-shift-credential-enabled (P2-01, off by default) a trip step may come from the phone's native outbox
 * with the shift credential instead of a JWT: WebSecurityConfiguration then lets POST /trips/{tripId}/{action} through and
 * this controller requires the credential (its rider's own trip, FleetShiftService.tripIdentity) or a RIDER JWT.
 */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetTripController {
    private static final String KEY = "Idempotency-Key";

    private final FleetTripService trips;
    private final ObjectMapper json;
    private final FleetShiftService shifts;
    private final boolean credentialSteps;

    public FleetTripController(FleetTripService trips, ObjectMapper json, FleetShiftService shifts,
                               @Value("${craves.fleet.trip-shift-credential-enabled:false}") boolean credentialSteps) {
        this.trips = trips;
        this.json = json;
        this.shifts = shifts;
        this.credentialSteps = credentialSteps;
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
     * One trip step: arrived-pickup, food-not-ready, picked-up and arrived-drop take no body, or only {ageMs, fix};
     * delivered takes {method: OTP, otp, capturedOffline?}; failed takes {reason, note}. Every body may carry ageMs and
     * fix (app 1.1.0): when and where the rider tapped. 409 when the step is out of order or the trip has ended.
     */
    @PostMapping("/trips/{tripId}/{action}")
    public ResponseEntity<Trip> step(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID tripId,
                                     @PathVariable String action, @RequestHeader(KEY) String key,
                                     @RequestHeader(name = FleetShiftService.SHIFT_CREDENTIAL, required = false) String credential,
                                     @RequestBody(required = false) StepBody body) {
        UUID identity = stepIdentity(principal, credential, tripId);
        String idempotencyKey = key(key);
        Tap tap = body == null ? Tap.NONE : new Tap(body.ageMs(), body.fix(), Boolean.TRUE.equals(body.capturedOffline()));
        return noStore(switch (action) {
            case "delivered" -> {
                if (body == null || !"OTP".equals(body.method())) {
                    throw FleetApiException.invalid("Send the customer's OTP, or the photo once the customer can't be reached.");
                }
                yield trips.deliveredByOtp(identity, tripId, body.otp(), idempotencyKey, tap);
            }
            case "failed" -> trips.failed(identity, tripId, body == null ? null : body.reason(), body == null ? null : body.note(),
                idempotencyKey, tap);
            default -> trips.step(identity, tripId, action, idempotencyKey, tap);
        });
    }

    /** delivered with method PHOTO (multipart): after two calls and the wait, or once the OTP is locked; pay held for ops. */
    @PostMapping(path = "/trips/{tripId}/delivered", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Trip> deliveredByPhoto(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID tripId,
                                                 @RequestHeader(KEY) String key,
                                                 @RequestHeader(name = FleetShiftService.SHIFT_CREDENTIAL, required = false) String credential,
                                                 @RequestParam("method") String method,
                                                 @RequestParam(value = "callsMade", required = false) Integer callsMade,
                                                 @RequestPart(value = "photo", required = false) MultipartFile photo,
                                                 @RequestParam(value = "ageMs", required = false) String ageMs,
                                                 @RequestParam(value = "fix", required = false) String fix) {
        if (!"PHOTO".equals(method)) {
            throw FleetApiException.invalid("Send method PHOTO with the photo.");
        }
        return noStore(trips.deliveredByPhoto(stepIdentity(principal, credential, tripId), tripId, callsMade, photo, key(key),
            new Tap(ageMs(ageMs), fix(fix))));
    }

    /** The shift credential's rider for this trip when credential steps are on and it was sent, else the RIDER JWT's identity. */
    private UUID stepIdentity(CravesPrincipal principal, String credential, UUID tripId) {
        if (credentialSteps && StringUtils.hasText(credential)) {
            return shifts.tripIdentity(credential, tripId);
        }
        return credentialSteps ? FleetRiderController.riderIdentity(principal) : identity(principal);
    }

    /**
     * The JSON bodies of a step (rider-v1): delivered {method, otp, capturedOffline}, failed {reason, note}; any step may add
     * ageMs and fix, when and where the rider tapped (app 1.1.0). capturedOffline: the code was typed without signal and the
     * app told the rider to go, so a refusal alerts ops.
     */
    public record StepBody(String method, String otp, String reason, String note, Long ageMs, RiderFix fix, Boolean capturedOffline) {
        public StepBody(String method, String otp, String reason, String note) {
            this(method, otp, reason, note, null, null, null);
        }
    }

    /** The photo form's ageMs; a value that isn't a whole number counts as none, never a refused delivery. */
    private static Long ageMs(String ageMs) {
        try {
            return ageMs == null || ageMs.isBlank() ? null : Long.valueOf(ageMs.trim());
        } catch (NumberFormatException notANumber) {
            return null;
        }
    }

    /** The photo form's fix field (RiderFix JSON); one that doesn't parse is evidence of nothing, never a refused delivery. */
    private RiderFix fix(String fix) {
        if (fix == null || fix.isBlank() || fix.length() > 2000) {
            return null;
        }
        try {
            return json.readValue(fix, RiderFix.class);
        } catch (JsonProcessingException notAFix) {
            return null;
        }
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
