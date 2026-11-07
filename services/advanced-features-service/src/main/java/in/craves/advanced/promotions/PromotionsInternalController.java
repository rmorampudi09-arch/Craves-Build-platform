package in.craves.advanced.promotions;

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
 * M24a: order-service confirms a reserved promotion once Finance has seen the net amount paid, and releases it when payment fails
 * or lapses or the order is cancelled before fulfilment. Those moments have no customer token, so the shared internal secret
 * authenticates the caller and {@code personId} must own the redemption. Answers like the module while it is switched off.
 */
@RestController
@RequestMapping("/internal/v1/promotions/redemptions/{redemptionId}")
public class PromotionsInternalController {
    public record InternalRedemptionConfirm(@NotNull UUID personId, @NotNull UUID orderId) { }

    public record InternalRedemptionRelease(@NotNull UUID personId, UUID orderId) { }

    /** What order-service checks before keeping a reservation at checkout: who funds it and the per-person limit. */
    public record InternalRedemptionTerms(UUID id, UUID promotionId, long discountPaise, PromotionsDtos.RedemptionStatus status,
                                          PromotionsDtos.FundedBy fundedBy, int perPersonLimit) { }

    private final PromotionsService service;
    private final ModuleRuntime runtime;
    private final Environment environment;

    public PromotionsInternalController(PromotionsService service, ModuleRuntime runtime, Environment environment) {
        this.service = service;
        this.runtime = runtime;
        this.environment = environment;
    }

    @GetMapping("/checkout-terms")
    public ResponseEntity<InternalRedemptionTerms> checkoutPromotionRedemptionTerms(
            @RequestHeader(value = InternalSecret.HEADER, required = false) String secret, @PathVariable UUID redemptionId,
            @RequestParam UUID personId) {
        ready(secret);
        return reply(service.checkoutTerms(personId, redemptionId));
    }

    @PostMapping("/confirm")
    public ResponseEntity<PromotionsDtos.PromotionRedemption> confirmPaidPromotionRedemption(
            @RequestHeader(value = InternalSecret.HEADER, required = false) String secret, @PathVariable UUID redemptionId,
            @Valid @RequestBody InternalRedemptionConfirm request) {
        ready(secret);
        return reply(service.confirmPaid(request.personId(), redemptionId, request.orderId()));
    }

    @PostMapping("/release")
    public ResponseEntity<PromotionsDtos.PromotionRedemption> releaseOrderPromotionRedemption(
            @RequestHeader(value = InternalSecret.HEADER, required = false) String secret, @PathVariable UUID redemptionId,
            @Valid @RequestBody InternalRedemptionRelease request) {
        ready(secret);
        return reply(service.releaseForOrder(request.personId(), redemptionId, request.orderId()));
    }

    private void ready(String secret) {
        InternalSecret.require(environment, secret);
        runtime.ensureReady(runtime.moduleFor("/api/v1/advanced/promotions").orElseThrow());
    }

    private static <T> ResponseEntity<T> reply(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
