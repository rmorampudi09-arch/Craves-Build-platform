package in.craves.advanced.trust;

import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.trust.TrustDtos.ChefDisputeStatement;
import in.craves.advanced.trust.TrustDtos.DisputePolicyView;
import in.craves.advanced.trust.TrustDtos.NewOrderDispute;
import in.craves.advanced.trust.TrustDtos.NewTrustReport;
import in.craves.advanced.trust.TrustDtos.OrderDisputeView;
import in.craves.advanced.trust.TrustDtos.TrustReportView;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A signed-in person's reports and disputes, the kitchen chef's side of a dispute, and the public dispute rule. */
@RestController
@RequestMapping("/api/v1/advanced/trust")
public class TrustController {
    private final TrustService service;
    private final Idempotency idempotency;

    public TrustController(TrustService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @PostMapping("/reports")
    public ResponseEntity<TrustReportView> fileTrustReport(@Valid @RequestBody NewTrustReport request,
                                                           @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID reporter = CurrentUser.id();
        var outcome = idempotency.run("trust.report", reporter, key, request, TrustReportView.class, () -> service.report(reporter, request));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @GetMapping("/reports/mine")
    public ResponseEntity<List<TrustReportView>> myTrustReports() {
        return ok(service.myReports(CurrentUser.id()));
    }

    /** How long after ordering a dispute may be opened (staff rule). */
    @GetMapping("/disputes/policy")
    public ResponseEntity<DisputePolicyView> disputePolicy() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(service.disputePolicy());
    }

    @PostMapping("/disputes")
    public ResponseEntity<OrderDisputeView> openOrderDispute(@Valid @RequestBody NewOrderDispute request,
                                                             @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID customer = CurrentUser.id();
        String token = CurrentUser.bearerToken();
        var outcome = idempotency.run("trust.dispute", customer, key, request, OrderDisputeView.class, () -> service.openDispute(customer, token, request));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @GetMapping("/disputes/mine")
    public ResponseEntity<List<OrderDisputeView>> myOrderDisputes() {
        return ok(service.myDisputes(CurrentUser.id()));
    }

    @PostMapping("/disputes/{disputeId}/withdraw")
    public ResponseEntity<OrderDisputeView> withdrawOrderDispute(@PathVariable UUID disputeId) {
        return ok(service.withdrawDispute(CurrentUser.id(), disputeId));
    }

    @GetMapping("/chef/disputes")
    public ResponseEntity<List<OrderDisputeView>> chefOrderDisputes() {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefDisputes(CurrentUser.bearerToken()));
    }

    @PostMapping("/chef/disputes/{disputeId}/statement")
    public ResponseEntity<OrderDisputeView> chefDisputeStatement(@PathVariable UUID disputeId, @Valid @RequestBody ChefDisputeStatement request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefStatement(chef, CurrentUser.bearerToken(), disputeId, request));
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
