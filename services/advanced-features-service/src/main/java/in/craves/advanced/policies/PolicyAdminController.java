package in.craves.advanced.policies;

import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.policies.PolicyDtos.PolicyDraftRequest;
import in.craves.advanced.policies.PolicyDtos.PolicyType;
import in.craves.advanced.policies.PolicyDtos.PolicyVersionView;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Staff draft a new version and switch it on; versions are never edited or deleted, so every past rule stays on record. */
@RestController
@RequestMapping("/api/v1/advanced/policies/admin")
public class PolicyAdminController {
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN, Roles.PAYMENTS_ADMIN, Roles.SUPPORT_ADMIN, Roles.AUDIT_ADMIN};
    private final PolicyService service;

    public PolicyAdminController(PolicyService service) {
        this.service = service;
    }

    /** Refund rules belong to platform and payments admins; the others to platform and operations admins. */
    static String[] editors(PolicyType type) {
        return type == PolicyType.CANCELLATION ? new String[] {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN}
                : new String[] {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN};
    }

    @GetMapping("/{type}/versions")
    public ResponseEntity<List<PolicyVersionView>> listPolicyVersions(@PathVariable String type) {
        CurrentUser.requireAnyRole(READERS);
        return PolicyController.ok(service.versions(PolicyService.type(type)));
    }

    @PostMapping("/{type}/versions")
    public ResponseEntity<PolicyVersionView> draftPolicyVersion(@PathVariable String type, @Valid @RequestBody PolicyDraftRequest request) {
        PolicyType policyType = PolicyService.type(type);
        UUID staff = CurrentUser.requireAnyRole(editors(policyType));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.draft(staff, policyType, request));
    }

    @PostMapping("/{type}/versions/{version}/activate")
    public ResponseEntity<PolicyVersionView> activatePolicyVersion(@PathVariable String type, @PathVariable int version) {
        PolicyType policyType = PolicyService.type(type);
        UUID staff = CurrentUser.requireAnyRole(editors(policyType));
        return PolicyController.ok(service.activate(staff, policyType, version));
    }
}
