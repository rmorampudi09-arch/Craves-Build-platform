package in.craves.advanced.promotions;

import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.promotions.PromotionsDtos.PromotionCartRequest;
import in.craves.advanced.promotions.PromotionsDtos.PromotionOffer;
import in.craves.advanced.promotions.PromotionsDtos.PromotionQuote;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemption;
import in.craves.advanced.promotions.PromotionsDtos.PromotionRedemptionConfirm;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public offers, and the signed-in person's quotes and redemptions (reserve at checkout, confirm with the order, or release). */
@RestController
@RequestMapping("/api/v1/advanced/promotions")
public class PromotionsController {
    private final PromotionsService service;
    private final Idempotency idempotency;

    public PromotionsController(PromotionsService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    /** kitchenId: only offers valid at that kitchen (all-kitchen offers included); every listed live offer when omitted. */
    @GetMapping("/offers")
    public ResponseEntity<List<PromotionOffer>> promotionOffers(@RequestParam(value = "kitchenId", required = false) UUID kitchenId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(service.offers(kitchenId));
    }

    @PostMapping("/quote")
    public ResponseEntity<PromotionQuote> quotePromotion(@Valid @RequestBody PromotionCartRequest request) {
        return ok(service.quote(CurrentUser.id(), request));
    }

    @PostMapping("/redemptions")
    public ResponseEntity<PromotionRedemption> reservePromotion(@Valid @RequestBody PromotionCartRequest request,
                                                                @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID person = CurrentUser.id();
        var outcome = idempotency.run("promotions.reserve", person, key, request, PromotionRedemption.class, () -> service.reserve(person, request));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @PostMapping("/redemptions/{redemptionId}/confirm")
    public ResponseEntity<PromotionRedemption> confirmPromotionRedemption(@PathVariable UUID redemptionId,
                                                                          @Valid @RequestBody PromotionRedemptionConfirm request) {
        return ok(service.confirm(CurrentUser.id(), redemptionId, request.orderId()));
    }

    @DeleteMapping("/redemptions/{redemptionId}")
    public ResponseEntity<Void> releasePromotionRedemption(@PathVariable UUID redemptionId) {
        service.release(CurrentUser.id(), redemptionId);
        return ResponseEntity.noContent().build();
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
