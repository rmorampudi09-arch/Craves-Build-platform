package in.craves.order.controller;

import in.craves.order.dto.OfferEngineRequest;
import in.craves.order.dto.OfferEngineResponse;
import in.craves.order.service.OfferEngineService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/offers")
@Validated
public class OfferEngineController {

    private final OfferEngineService offerEngineService;

    public OfferEngineController(OfferEngineService offerEngineService) {
        this.offerEngineService = offerEngineService;
    }

    @GetMapping("/applicable")
    public List<OfferEngineResponse> applicableOffers(@RequestHeader("X-Customer-Id") Long customerId,
                                                      @RequestParam("cartId") Long cartId) {
        return offerEngineService.applicableOffers(customerId, cartId);
    }

    @PostMapping("/validate")
    public OfferEngineResponse validateOffer(@RequestHeader("X-Customer-Id") Long customerId,
                                             @Valid @RequestBody OfferEngineRequest request) {
        return offerEngineService.validateOffer(customerId, request);
    }
}
