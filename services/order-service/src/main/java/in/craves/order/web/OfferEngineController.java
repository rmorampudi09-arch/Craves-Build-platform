package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OfferEngineService;
import in.craves.order.web.OfferEngineDtos.OfferCodeRequest;
import in.craves.order.web.OfferEngineDtos.OfferResponse;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/offers")
public class OfferEngineController {
    private final OfferEngineService offerEngineService;

    public OfferEngineController(OfferEngineService offerEngineService) {
        this.offerEngineService = offerEngineService;
    }

    @GetMapping("/applicable")
    public List<OfferResponse> listApplicable(@AuthenticationPrincipal CravesPrincipal principal) {
        return offerEngineService.listApplicable(principal);
    }

    @PostMapping("/validate")
    public OfferResponse validate(
        @AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody OfferCodeRequest request
    ) {
        return offerEngineService.validate(principal, request);
    }
}
