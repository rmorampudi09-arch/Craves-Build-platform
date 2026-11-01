package in.craves.advanced.policies;

import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.policies.PolicyDtos.CancellationCheck;
import in.craves.advanced.policies.PolicyDtos.CancellationVerdict;
import in.craves.advanced.policies.PolicyDtos.NotificationCheck;
import in.craves.advanced.policies.PolicyDtos.NotificationVerdict;
import in.craves.advanced.policies.PolicyDtos.PolicyVersionView;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingCheck;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingVerdict;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityCheck;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityVerdict;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Signed-in callers read the active policies (customers can see the refund rules) and evaluate them; evaluations store nothing. */
@RestController
@RequestMapping("/api/v1/advanced/policies")
public class PolicyController {
    private final PolicyService service;

    public PolicyController(PolicyService service) {
        this.service = service;
    }

    @GetMapping("/{type}/active")
    public ResponseEntity<PolicyVersionView> activePolicy(@PathVariable String type) {
        CurrentUser.id();
        return ok(service.active(PolicyService.type(type)));
    }

    @PostMapping("/serviceability/evaluate")
    public ResponseEntity<ServiceabilityVerdict> evaluateServiceability(@Valid @RequestBody ServiceabilityCheck check) {
        CurrentUser.id();
        return ok(service.serviceability(check));
    }

    @PostMapping("/cancellation/evaluate")
    public ResponseEntity<CancellationVerdict> evaluateCancellation(@Valid @RequestBody CancellationCheck check) {
        CurrentUser.id();
        return ok(service.cancellation(check));
    }

    @PostMapping("/provider-ranking/evaluate")
    public ResponseEntity<ProviderRankingVerdict> evaluateProviderRanking(@Valid @RequestBody ProviderRankingCheck check) {
        CurrentUser.id();
        return ok(service.providerRanking(check));
    }

    @PostMapping("/notification-frequency/evaluate")
    public ResponseEntity<NotificationVerdict> evaluateNotificationFrequency(@Valid @RequestBody NotificationCheck check) {
        CurrentUser.id();
        return ok(service.notification(check));
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
