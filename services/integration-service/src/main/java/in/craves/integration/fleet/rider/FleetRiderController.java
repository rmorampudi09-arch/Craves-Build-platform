package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.rider.FleetRiderModels.AcceptPrivacyNotice;
import in.craves.integration.fleet.rider.FleetRiderModels.AcceptTerms;
import in.craves.integration.fleet.rider.FleetRiderModels.DeviceRegistration;
import in.craves.integration.fleet.rider.FleetRiderModels.HomeSummary;
import in.craves.integration.fleet.rider.FleetRiderModels.OrderPreferences;
import in.craves.integration.fleet.rider.FleetRiderModels.PauseRequest;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderMe;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderProfile;
import in.craves.integration.fleet.rider.FleetRiderModels.ShiftPause;
import in.craves.integration.fleet.rider.FleetRiderModels.ShiftStart;
import in.craves.integration.fleet.rider.FleetRiderModels.Terms;
import in.craves.integration.security.CravesPrincipal;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The rider app's API (contracts/openapi/rider-v1.yaml). WebSecurityConfiguration requires the RIDER role on
 * every route here except GET /me, GET /profile, POST /documents and POST /privacy-notice/accept (a signed-in identity;
 * the service requires a rider row) and POST /devices (the RIDER check or the shift credential is here). Off unless
 * CRAVES_FLEET_RIDER_API_ENABLED.
 */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetRiderController {
    private final FleetRiderService service;
    private final FleetShiftService shifts;

    public FleetRiderController(FleetRiderService service, FleetShiftService shifts) {
        this.service = service;
        this.shifts = shifts;
    }

    /** Any signed-in user: NOT_RIDER when no rider matches. */
    @GetMapping("/me")
    public ResponseEntity<RiderMe> me(@AuthenticationPrincipal CravesPrincipal principal) {
        identity(principal);
        return noStore(service.me(principal));
    }

    @GetMapping("/profile")
    public ResponseEntity<RiderProfile> profile(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(service.profile(identity(principal)));
    }

    @GetMapping("/home")
    public ResponseEntity<HomeSummary> home(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(service.home(identity(principal)));
    }

    @PostMapping(path = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Void> uploadDocument(@AuthenticationPrincipal CravesPrincipal principal, @RequestParam("type") String type,
                                               @RequestPart("photo") MultipartFile photo) {
        service.uploadDocument(identity(principal), type, photo);
        return ResponseEntity.noContent().build();
    }

    /** 403 RIDER_NOT_ACTIVE, APP_UPDATE_REQUIRED or DOCUMENTS_EXPIRED; 409 DEVICE_NOT_BOUND or SHIFT_OPEN; 422 SELFIE_INVALID. */
    @PostMapping(path = "/shift/start", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ShiftStart> startShift(@AuthenticationPrincipal CravesPrincipal principal,
                                                 @RequestHeader(name = FleetShiftService.INSTALLATION_ID, required = false) String installationId,
                                                 @RequestPart("selfie") MultipartFile selfie) {
        return noStore(shifts.start(identity(principal), installationId, selfie));
    }

    @PostMapping("/shift/end")
    public ResponseEntity<Void> endShift(@AuthenticationPrincipal CravesPrincipal principal) {
        shifts.end(identity(principal));
        return ResponseEntity.noContent().build();
    }

    /** Phase 4: a break while online, 5 to 60 minutes. 409 NOT_ONLINE; 503 RIDER_CHOICES_OFF. */
    @PostMapping("/shift/pause")
    public ResponseEntity<ShiftPause> pause(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody PauseRequest body) {
        return noStore(shifts.pause(identity(principal), body == null ? null : body.minutes()));
    }

    /** Ends a break now; harmless when there is none. */
    @PostMapping("/shift/resume")
    public ResponseEntity<Void> resume(@AuthenticationPrincipal CravesPrincipal principal) {
        shifts.resume(identity(principal));
        return ResponseEntity.noContent().build();
    }

    /** Phase 4: the farthest pickup and drop the rider wants to hear of (null: any). 503 RIDER_CHOICES_OFF. */
    @PutMapping("/preferences")
    public ResponseEntity<OrderPreferences> preferences(@AuthenticationPrincipal CravesPrincipal principal,
                                                        @RequestBody OrderPreferences body) {
        return noStore(service.setPreferences(identity(principal), body));
    }

    /**
     * The phone's FCM token, with a RIDER JWT or the shift credential. 204 for the rider's bound phone; 409
     * DEVICE_NOT_BOUND for another, which is kept for ops to approve.
     */
    @PostMapping("/devices")
    public ResponseEntity<Void> registerDevice(@AuthenticationPrincipal CravesPrincipal principal,
                                               @RequestHeader(name = FleetShiftService.SHIFT_CREDENTIAL, required = false) String credential,
                                               @RequestBody DeviceRegistration body) {
        boolean bound = StringUtils.hasText(credential) ? shifts.registerDevice(null, credential, body)
            : shifts.registerDevice(riderIdentity(principal), null, body);
        if (!bound) {
            throw FleetShiftService.deviceNotBound();
        }
        return ResponseEntity.noContent().build();
    }

    /** Phase 4: a copy of everything Craves keeps about the rider (DPDP Act s.11): JSON, newest first in each list. */
    @GetMapping("/my-data")
    public ResponseEntity<Map<String, Object>> myData(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(service.myData(identity(principal)));
    }

    @GetMapping("/terms")
    public ResponseEntity<Terms> terms(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(service.terms(identity(principal)));
    }

    @PostMapping("/terms/accept")
    public ResponseEntity<Void> acceptTerms(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody AcceptTerms body) {
        service.acceptTerms(identity(principal), body.version());
        return ResponseEntity.noContent().build();
    }

    /** Also for a PENDING rider, before they send documents (P2-09). 409 NOTICE_CHANGED for any version but the one in force. */
    @PostMapping("/privacy-notice/accept")
    public ResponseEntity<Void> acceptPrivacyNotice(@AuthenticationPrincipal CravesPrincipal principal,
                                                    @RequestBody AcceptPrivacyNotice body) {
        service.acceptPrivacyNotice(identity(principal), body.version(), body.language());
        return ResponseEntity.noContent().build();
    }

    static UUID identity(CravesPrincipal principal) {
        if (principal == null || principal.identityId() == null) {
            throw new FleetApiException(401, "SIGN_IN_REQUIRED", "Sign in again.");
        }
        return principal.identityId();
    }

    /** The signed-in identity holding the RIDER role, for the routes Spring Security lets through for the shift credential. */
    public static UUID riderIdentity(CravesPrincipal principal) {
        UUID identity = identity(principal);
        if (!principal.hasRole("RIDER")) {
            throw FleetApiException.forbidden();
        }
        return identity;
    }

    static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
