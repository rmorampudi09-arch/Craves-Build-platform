package in.craves.integration.fleet.admin;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetRules;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.FileContent;
import in.craves.integration.fleet.admin.FleetAdminModels.NewRider;
import in.craves.integration.fleet.admin.FleetAdminModels.PayoutAccountInput;
import in.craves.integration.fleet.admin.FleetAdminModels.ReasonInput;
import in.craves.integration.fleet.admin.FleetAdminModels.StatusEventInput;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
 * Ops console API, contracts/openapi/admin-fleet-v1.yaml (P1 paths). Each operation checks its own scoped admin
 * roles (x-roles); the legacy ADMIN role grants nothing. Mutations need an Idempotency-Key.
 */
@RestController
@RequestMapping("/api/v1/admin/fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetAdminController {
    private static final String[] READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN"};
    private static final String[] OPERATORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN"};
    private static final String[] DOCUMENT_READERS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN"};
    private static final String[] PAYMENTS = {"PLATFORM_ADMIN", "PAYMENTS_ADMIN"};
    private static final String[] AUDITORS = {"PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN", "AUDIT_ADMIN"};
    private static final String KEY = "Idempotency-Key";

    private final FleetAdminService service;

    public FleetAdminController(FleetAdminService service) {
        this.service = service;
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
        return file(service.documentContent(admin(principal, DOCUMENT_READERS), riderId, documentId));
    }

    @PostMapping("/riders/{riderId}/documents/{documentId}/approve")
    public ResponseEntity<Object> approveDocument(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader(KEY) UUID key,
                                                  @PathVariable UUID riderId, @PathVariable UUID documentId) {
        return json(200, service.approveDocument(admin(principal, OPERATORS), key, riderId, documentId));
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

    @GetMapping("/audit")
    public ResponseEntity<Object> audit(@AuthenticationPrincipal CravesPrincipal principal,
                                        @RequestParam(required = false) UUID riderId,
                                        @RequestParam(required = false) String cursor) {
        admin(principal, AUDITORS);
        return json(200, service.audit(riderId, cursor));
    }

    static Admin admin(CravesPrincipal principal, String... roles) {
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
