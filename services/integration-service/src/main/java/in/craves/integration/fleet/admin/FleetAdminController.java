package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.DocumentApproval;
import in.craves.integration.fleet.admin.FleetAdminModels.FileContent;
import in.craves.integration.fleet.admin.FleetAdminModels.NewRider;
import in.craves.integration.fleet.admin.FleetAdminModels.PayoutAccountInput;
import in.craves.integration.fleet.admin.FleetAdminModels.ReasonInput;
import in.craves.integration.fleet.admin.FleetAdminModels.StatusEventInput;
import in.craves.integration.fleet.admin.FleetAdminModels.VehicleInput;
import in.craves.integration.fleet.admin.FleetAdminModels.ZoneBanner;
import in.craves.integration.security.CravesPrincipal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
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
 * Ops console API, contracts/openapi/admin-fleet-v1.yaml (P1 paths, document expiry, vehicle and the zone banner). Each
 * operation checks its own scoped admin roles (x-roles); the legacy ADMIN role grants nothing. Mutations need an
 * Idempotency-Key.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetAdminController {
    // Payments admins read riders too: they open the rider to set the payout account in person.
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN", "PAYMENTS_ADMIN", "SUPPORT_ADMIN",
        "AUDIT_ADMIN"};
    private static final String[] OPERATORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};
    private static final String[] FILE_READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN"};
    private static final String[] PAYMENTS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN"};
    private static final String[] AUDITORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN", "AUDIT_ADMIN"};
    private static final String[] BANNER_READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final String KEY = "Idempotency-Key";

    private final FleetAdminService service;
    private final RiderJoinsExitsExport joinsExits;

    public FleetAdminController(FleetAdminService service, RiderJoinsExitsExport joinsExits) {
        this.service = service;
        this.joinsExits = joinsExits;
    }

    @GetMapping("/riders")
    public ResponseEntity<Object> listRiders(@AuthenticationPrincipal CravesPrincipal principal,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(required = false) String search,
                                             @RequestParam(required = false) String cursor) {
        admin(principal, READERS);
        return json(200, service.listRiders(status, search, cursor));
    }

    @PostMapping("/riders")
    public ResponseEntity<Object> createRider(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                              @RequestBody NewRider body) {
        return json(201, service.createRider(admin(principal, OPERATORS), key, body));
    }

    @GetMapping("/riders/{riderId}")
    public ResponseEntity<Object> getRider(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID riderId) {
        admin(principal, READERS);
        return json(200, service.getRider(riderId));
    }

    @GetMapping("/riders/{riderId}/documents/{documentId}/content")
    public ResponseEntity<byte[]> documentContent(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID riderId,
                                                  @PathVariable UUID documentId) {
        return file(service.documentContent(admin(principal, FILE_READERS), riderId, documentId));
    }

    /** Body {expiresOn} is optional, but required for DRIVING_LICENCE, VEHICLE_RC, VEHICLE_INSURANCE and PUC (422 EXPIRY_REQUIRED). */
    @PostMapping("/riders/{riderId}/documents/{documentId}/approve")
    public ResponseEntity<Object> approveDocument(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                  @PathVariable UUID riderId, @PathVariable UUID documentId,
                                                  @RequestBody(required = false) DocumentApproval body) {
        return json(200, service.approveDocument(admin(principal, OPERATORS), key, riderId, documentId, body == null ? null : body.expiresOn()));
    }

    @PostMapping("/riders/{riderId}/documents/{documentId}/reject")
    public ResponseEntity<Object> rejectDocument(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                 @PathVariable UUID riderId, @PathVariable UUID documentId,
                                                 @RequestBody ReasonInput body) {
        return json(200, service.rejectDocument(admin(principal, OPERATORS), key, riderId, documentId, body.reason()));
    }

    @PostMapping("/riders/{riderId}/devices/{deviceId}/approve")
    public ResponseEntity<Object> approveDevice(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                @PathVariable UUID riderId, @PathVariable UUID deviceId) {
        return json(200, service.approveDevice(admin(principal, OPERATORS), key, riderId, deviceId));
    }

    @PutMapping("/riders/{riderId}/payout-account")
    public ResponseEntity<Object> setPayoutAccount(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                   @PathVariable UUID riderId, @RequestBody PayoutAccountInput body) {
        return json(200, service.setPayoutAccount(admin(principal, PAYMENTS), key, riderId, body));
    }

    /** The account the rider sent from the app becomes the payout account (payments admins, like setting one). */
    @PostMapping("/riders/{riderId}/payout-account/confirm")
    public ResponseEntity<Object> confirmPayoutAccount(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                       @PathVariable UUID riderId) {
        return json(200, service.confirmPayoutAccount(admin(principal, PAYMENTS), key, riderId));
    }

    @PutMapping("/riders/{riderId}/vehicle")
    public ResponseEntity<Object> setVehicle(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                             @PathVariable UUID riderId, @RequestBody VehicleInput body) {
        return json(200, service.setVehicle(admin(principal, OPERATORS), key, riderId, body));
    }

    @PostMapping("/riders/{riderId}/status-events")
    public ResponseEntity<Object> createStatusEvent(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                    @PathVariable UUID riderId, @RequestBody StatusEventInput body) {
        return json(201, service.createStatusEvent(admin(principal, OPERATORS), key, riderId, body));
    }

    @GetMapping("/selfie-reviews")
    public ResponseEntity<Object> selfieReviews(@AuthenticationPrincipal CravesPrincipal principal,
                                                @RequestParam(defaultValue = "PENDING") String state) {
        admin(principal, OPERATORS);
        return json(200, service.selfieReviews(state));
    }

    @GetMapping("/shifts/{shiftId}/selfie")
    public ResponseEntity<byte[]> selfie(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID shiftId) {
        return file(service.selfie(admin(principal, OPERATORS), shiftId));
    }

    @PostMapping("/shifts/{shiftId}/selfie/approve")
    public ResponseEntity<Object> approveSelfie(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                @PathVariable UUID shiftId) {
        return json(200, service.reviewSelfie(admin(principal, OPERATORS), key, shiftId, true, null));
    }

    @PostMapping("/shifts/{shiftId}/selfie/reject")
    public ResponseEntity<Object> rejectSelfie(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                               @PathVariable UUID shiftId, @RequestBody ReasonInput body) {
        return json(200, service.reviewSelfie(admin(principal, OPERATORS), key, shiftId, false, body.reason()));
    }

    /** The banner riders see on Home now; 204 when none shows. */
    @GetMapping("/banner")
    public ResponseEntity<Object> banner(@AuthenticationPrincipal CravesPrincipal principal) {
        admin(principal, BANNER_READERS);
        ZoneBanner banner = service.banner();
        return banner == null ? ResponseEntity.noContent().header("Cache-Control", "no-store").build() : json(200, banner);
    }

    @PutMapping("/banner")
    public ResponseEntity<Object> setBanner(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                            @RequestBody ZoneBanner body) {
        return json(200, service.setBanner(admin(principal, OPERATORS), key, body));
    }

    @DeleteMapping("/banner")
    public ResponseEntity<Void> clearBanner(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key) {
        service.clearBanner(admin(principal, OPERATORS), key);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/audit")
    public ResponseEntity<Object> audit(@AuthenticationPrincipal CravesPrincipal principal,
                                        @RequestParam(required = false) UUID riderId,
                                        @RequestParam(required = false) String cursor) {
        admin(principal, AUDITORS);
        return json(200, service.audit(riderId, cursor));
    }

    /** Riders who joined or exited on one IST date, for the government portal. Audited as a download. */
    @GetMapping("/exports/rider-joins-exits")
    public ResponseEntity<byte[]> riderJoinsExits(@AuthenticationPrincipal CravesPrincipal principal,
                                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        Admin admin = admin(principal, FILE_READERS);
        byte[] csv = joinsExits.csv(date).getBytes(StandardCharsets.UTF_8);
        service.audit(admin, "EXPORT_DOWNLOADED", null, date.toString(), "Downloaded rider joins and exits for " + date + ".");
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("Content-Type", "text/csv; charset=UTF-8")
            .header("Content-Disposition", "attachment; filename=\"rider-joins-exits-" + date + ".csv\"").body(csv);
    }

    public static Admin admin(CravesPrincipal principal, String... roles) {
        if (principal == null || principal.identityId() == null || !principal.hasAnyRole(roles)) {
            throw FleetApiException.forbidden();
        }
        return new Admin(principal.identityId(), FleetRules.adminName(principal.phoneNumber(), principal.identityId()));
    }

    private static ResponseEntity<Object> json(int status, Object body) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(body);
    }

    private static ResponseEntity<byte[]> file(FileContent content) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
            .header("Content-Disposition", "inline").header("Content-Type", content.contentType()).body(content.bytes());
    }
}
