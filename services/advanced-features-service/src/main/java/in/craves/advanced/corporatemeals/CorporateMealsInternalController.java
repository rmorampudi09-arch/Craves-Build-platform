package in.craves.advanced.corporatemeals;

import in.craves.advanced.corporatemeals.CorporateMealsDtos.CompanyCharge;
import in.craves.advanced.platform.module.ModuleRuntime;
import in.craves.advanced.platform.security.InternalSecret;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M24d: order-service reads a reserved company share at checkout, confirms it once Finance has seen the person's part paid, and
 * releases it when payment fails or lapses or the order is cancelled before fulfilment. Those moments have no customer token, so the
 * shared internal secret authenticates the caller and {@code personId} must own the charge. Answers like the module while it is off.
 */
@RestController
@RequestMapping("/internal/v1/corporate-meals/charges/{chargeId}")
public class CorporateMealsInternalController {
    public record InternalCompanyChargeConfirm(@NotNull UUID personId, @NotNull UUID orderId) { }

    public record InternalCompanyChargeRelease(@NotNull UUID personId, UUID orderId) { }

    private final CorporateMealsService service;
    private final ModuleRuntime runtime;
    private final Environment environment;

    public CorporateMealsInternalController(CorporateMealsService service, ModuleRuntime runtime, Environment environment) {
        this.service = service;
        this.runtime = runtime;
        this.environment = environment;
    }

    @GetMapping("/checkout-terms")
    public ResponseEntity<CompanyCharge> checkoutCompanyChargeTerms(
            @RequestHeader(value = InternalSecret.HEADER, required = false) String secret, @PathVariable UUID chargeId,
            @RequestParam UUID personId) {
        ready(secret);
        return reply(service.checkoutCharge(personId, chargeId));
    }

    @PostMapping("/confirm")
    public ResponseEntity<CompanyCharge> confirmPaidCompanyCharge(
            @RequestHeader(value = InternalSecret.HEADER, required = false) String secret, @PathVariable UUID chargeId,
            @Valid @RequestBody InternalCompanyChargeConfirm request) {
        ready(secret);
        return reply(service.confirmPaid(request.personId(), chargeId, request.orderId()));
    }

    @PostMapping("/release")
    public ResponseEntity<CompanyCharge> releaseOrderCompanyCharge(
            @RequestHeader(value = InternalSecret.HEADER, required = false) String secret, @PathVariable UUID chargeId,
            @Valid @RequestBody InternalCompanyChargeRelease request) {
        ready(secret);
        return reply(service.releaseForOrder(request.personId(), chargeId, request.orderId()));
    }

    private void ready(String secret) {
        InternalSecret.require(environment, secret);
        runtime.ensureReady(runtime.moduleFor("/api/v1/advanced/corporate-meals").orElseThrow());
    }

    private static <T> ResponseEntity<T> reply(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
