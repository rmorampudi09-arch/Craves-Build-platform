package in.craves.advanced.trust;

import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.trust.TrustDtos.DisputePolicy;
import in.craves.advanced.trust.TrustDtos.DisputePolicyView;
import in.craves.advanced.trust.TrustDtos.DisputeStatus;
import in.craves.advanced.trust.TrustDtos.NewRiskFlag;
import in.craves.advanced.trust.TrustDtos.OrderDisputeDecision;
import in.craves.advanced.trust.TrustDtos.ReportStatus;
import in.craves.advanced.trust.TrustDtos.ReportTarget;
import in.craves.advanced.trust.TrustDtos.RiskFlagClear;
import in.craves.advanced.trust.TrustDtos.RiskFlagView;
import in.craves.advanced.trust.TrustDtos.RiskSubject;
import in.craves.advanced.trust.TrustDtos.RiskSummary;
import in.craves.advanced.trust.TrustDtos.StaffOrderDispute;
import in.craves.advanced.trust.TrustDtos.StaffTrustReport;
import in.craves.advanced.trust.TrustDtos.TrustReportDecision;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Staff moderation queue, dispute decisions and rule, and risk flags with per-person and per-kitchen counts. */
@RestController
@RequestMapping("/api/v1/advanced/trust/admin")
public class TrustAdminController {
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.SUPPORT_ADMIN, Roles.COMPLIANCE_ADMIN, Roles.OPERATIONS_ADMIN,
            Roles.PAYMENTS_ADMIN, Roles.AUDIT_ADMIN};
    // SUPPORT_ADMIN reads only (Auth defines it as read-only); decisions follow each role's own area in Auth.
    private static final String[] MODERATORS = {Roles.PLATFORM_ADMIN, Roles.COMPLIANCE_ADMIN, Roles.OPERATIONS_ADMIN};
    private static final String[] DISPUTE_DECIDERS = {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN};
    private static final String[] POLICY_EDITORS = {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN};
    private static final String[] FLAGGERS = {Roles.PLATFORM_ADMIN, Roles.COMPLIANCE_ADMIN, Roles.OPERATIONS_ADMIN, Roles.PAYMENTS_ADMIN};
    private final TrustService service;

    public TrustAdminController(TrustService service) {
        this.service = service;
    }

    /** status: OPEN when omitted; oldest first. */
    @GetMapping("/reports")
    public ResponseEntity<List<StaffTrustReport>> trustReportQueue(@RequestParam(value = "status", required = false) ReportStatus status) {
        CurrentUser.requireAnyRole(READERS);
        return TrustController.ok(service.reportQueue(status));
    }

    @GetMapping("/reports/targets/{targetType}/{targetId}")
    public ResponseEntity<List<StaffTrustReport>> trustReportsAbout(@PathVariable ReportTarget targetType, @PathVariable UUID targetId) {
        CurrentUser.requireAnyRole(READERS);
        return TrustController.ok(service.reportsAbout(targetType, targetId));
    }

    @PostMapping("/reports/{reportId}/decide")
    public ResponseEntity<StaffTrustReport> decideTrustReport(@PathVariable UUID reportId, @Valid @RequestBody TrustReportDecision decision) {
        UUID staff = CurrentUser.requireAnyRole(MODERATORS);
        return TrustController.ok(service.decideReport(staff, reportId, decision));
    }

    @PutMapping("/disputes/policy")
    public ResponseEntity<DisputePolicyView> setDisputePolicy(@Valid @RequestBody DisputePolicy request) {
        UUID staff = CurrentUser.requireAnyRole(POLICY_EDITORS);
        return TrustController.ok(service.setDisputePolicy(staff, request.windowHours()));
    }

    /** status: OPEN when omitted; oldest first. */
    @GetMapping("/disputes")
    public ResponseEntity<List<StaffOrderDispute>> orderDisputeQueue(@RequestParam(value = "status", required = false) DisputeStatus status) {
        CurrentUser.requireAnyRole(READERS);
        return TrustController.ok(service.disputeQueue(status));
    }

    @PostMapping("/disputes/{disputeId}/decide")
    public ResponseEntity<StaffOrderDispute> decideOrderDispute(@PathVariable UUID disputeId, @Valid @RequestBody OrderDisputeDecision decision) {
        UUID staff = CurrentUser.requireAnyRole(DISPUTE_DECIDERS);
        String chefToken = CurrentUser.hasRole(Roles.CHEF) ? CurrentUser.bearerToken() : null;
        return TrustController.ok(service.decideDispute(staff, chefToken, disputeId, decision));
    }

    @PostMapping("/flags")
    public ResponseEntity<RiskFlagView> raiseRiskFlag(@Valid @RequestBody NewRiskFlag request) {
        UUID staff = CurrentUser.requireAnyRole(FLAGGERS);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.raiseFlag(staff, request));
    }

    @GetMapping("/flags/{subjectType}/{subjectId}")
    public ResponseEntity<List<RiskFlagView>> riskFlags(@PathVariable RiskSubject subjectType, @PathVariable UUID subjectId) {
        CurrentUser.requireAnyRole(READERS);
        return TrustController.ok(service.flags(subjectType, subjectId));
    }

    @PostMapping("/flags/{flagId}/clear")
    public ResponseEntity<RiskFlagView> clearRiskFlag(@PathVariable UUID flagId, @Valid @RequestBody RiskFlagClear request) {
        UUID staff = CurrentUser.requireAnyRole(FLAGGERS);
        return TrustController.ok(service.clearFlag(staff, flagId, request.note()));
    }

    @GetMapping("/subjects/{subjectType}/{subjectId}")
    public ResponseEntity<RiskSummary> riskSummary(@PathVariable RiskSubject subjectType, @PathVariable UUID subjectId) {
        CurrentUser.requireAnyRole(READERS);
        return TrustController.ok(service.summary(subjectType, subjectId));
    }
}
