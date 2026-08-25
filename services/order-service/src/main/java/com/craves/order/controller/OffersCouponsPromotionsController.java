package com.craves.order.controller;

import com.craves.order.dto.OffersCouponsPromotionsRequest;
import com.craves.order.dto.OffersCouponsPromotionsResponse;
import com.craves.order.service.OffersCouponsPromotionsService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/promotions")
public class OffersCouponsPromotionsController {

    private final OffersCouponsPromotionsService service;

    public OffersCouponsPromotionsController(OffersCouponsPromotionsService service) {
        this.service = service;
    }

    @PostMapping("/validate")
    public ResponseEntity<OffersCouponsPromotionsResponse> validate(@Valid @RequestBody OffersCouponsPromotionsRequest request) {
        return ResponseEntity.ok(service.validate(request));
    }

    @PostMapping("/apply")
    public ResponseEntity<OffersCouponsPromotionsResponse> apply(@Valid @RequestBody OffersCouponsPromotionsRequest request) {
        return ResponseEntity.ok(service.apply(request));
    }

    @GetMapping("/active")
    public ResponseEntity<List<OffersCouponsPromotionsResponse.PromotionCard>> active() {
        return ResponseEntity.ok(service.activeOffers());
    }

    @GetMapping("/my-offers")
    public ResponseEntity<List<OffersCouponsPromotionsResponse.PromotionCard>> myOffers() {
        return ResponseEntity.ok(service.activeOffers());
    }
}
