package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.rider.FleetRiderModels.AcceptTerms;
import in.craves.integration.fleet.rider.FleetRiderModels.HomeSummary;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderMe;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderProfile;
import in.craves.integration.fleet.rider.FleetRiderModels.ShiftStart;
import in.craves.integration.fleet.rider.FleetRiderModels.Terms;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The rider app's API (contracts/openapi/rider-v1.yaml). WebSecurityConfiguration requires the RIDER role on
 * every route here except GET /me. Off unless CRAVES_FLEET_RIDER_API_ENABLED.
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

    @GetMapping("/terms")
    public ResponseEntity<Terms> terms(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(service.terms(identity(principal)));
    }

    @PostMapping("/terms/accept")
    public ResponseEntity<Void> acceptTerms(@AuthenticationPrincipal CravesPrincipal principal, @RequestBody AcceptTerms body) {
        service.acceptTerms(identity(principal), body.version());
        return ResponseEntity.noContent().build();
    }

    static UUID identity(CravesPrincipal principal) {
        if (principal == null || principal.identityId() == null) {
            throw new FleetApiException(401, "SIGN_IN_REQUIRED", "Sign in again.");
        }
        return principal.identityId();
    }

    static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
