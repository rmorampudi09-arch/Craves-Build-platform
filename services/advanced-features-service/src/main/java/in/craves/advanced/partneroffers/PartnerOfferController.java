package in.craves.advanced.partneroffers;

import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferCard;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferClaimRequest;
import in.craves.advanced.partneroffers.PartnerOfferDtos.PartnerOfferClaimView;
import in.craves.advanced.platform.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A customer's paid order unlocks partner offers; claiming one reveals its code and link. The order is read with the caller's token. */
@RestController
@RequestMapping("/api/v1/advanced/partner-offers")
public class PartnerOfferController {
    private final PartnerOfferService service;

    public PartnerOfferController(PartnerOfferService service) {
        this.service = service;
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<List<PartnerOfferCard>> partnerOffersForOrder(@PathVariable UUID orderId) {
        return ok(service.forOrder(CurrentUser.id(), CurrentUser.bearerToken(), orderId));
    }

    @PostMapping("/orders/{orderId}/claims")
    public ResponseEntity<PartnerOfferClaimView> claimPartnerOffer(@PathVariable UUID orderId, @Valid @RequestBody PartnerOfferClaimRequest request) {
        return ok(service.claim(CurrentUser.id(), CurrentUser.bearerToken(), orderId, request.offerId()));
    }

    @GetMapping("/claims")
    public ResponseEntity<List<PartnerOfferClaimView>> myPartnerOfferClaims() {
        return ok(service.mine(CurrentUser.id()));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
