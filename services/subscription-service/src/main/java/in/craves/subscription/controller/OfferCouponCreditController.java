package in.craves.subscription.controller;

import in.craves.subscription.dto.OfferCouponCreditRequest;
import in.craves.subscription.dto.OfferCouponCreditResponse;
import in.craves.subscription.service.OfferCouponCreditService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/offers")
public class OfferCouponCreditController {
    private final OfferCouponCreditService service;
    public OfferCouponCreditController(OfferCouponCreditService service) { this.service = service; }
    @PostMapping("/validate")
    public ResponseEntity<OfferCouponCreditResponse> validate(@Valid @RequestBody OfferCouponCreditRequest request) {
        return ResponseEntity.ok(service.validate(request));
    }
}
