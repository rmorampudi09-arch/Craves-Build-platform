package com.craves.integration.controller;

import com.craves.integration.dto.OfferEngineRequest;
import com.craves.integration.dto.OfferEngineResponse;
import com.craves.integration.service.OfferEngineService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class OfferEngineController {

    private final OfferEngineService offerEngineService;

    public OfferEngineController(OfferEngineService offerEngineService) {
        this.offerEngineService = offerEngineService;
    }

    @PostMapping("/offers/apply")
    public ResponseEntity<OfferEngineResponse> applyOffer(
            @RequestHeader("X-User-Id") String customerId,
            @Valid @RequestBody OfferEngineRequest request) {
        return ResponseEntity.ok(offerEngineService.apply(customerId, request));
    }

    @GetMapping("/wallet")
    public ResponseEntity<List<OfferEngineResponse>> wallet(@RequestHeader("X-User-Id") String customerId,
                                                            @RequestParam(required = false) String cartId) {
        return ResponseEntity.ok(offerEngineService.wallet(customerId, cartId));
    }
}
