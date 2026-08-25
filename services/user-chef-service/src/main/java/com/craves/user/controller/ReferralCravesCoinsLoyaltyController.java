package com.craves.user.controller;

import com.craves.user.dto.ReferralCravesCoinsLoyaltyRequest;
import com.craves.user.dto.ReferralCravesCoinsLoyaltyResponse;
import com.craves.user.service.ReferralCravesCoinsLoyaltyService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/loyalty")
public class ReferralCravesCoinsLoyaltyController {
    private final ReferralCravesCoinsLoyaltyService service;
    public ReferralCravesCoinsLoyaltyController(ReferralCravesCoinsLoyaltyService service) {
        this.service = service;
    }
    @GetMapping("/wallet")
    public ResponseEntity<List<ReferralCravesCoinsLoyaltyResponse>> wallet(@RequestHeader("X-User-Id") String customerId) {
        return ResponseEntity.ok(service.wallet(customerId));
    }
    @PostMapping("/redeem")
    public ResponseEntity<ReferralCravesCoinsLoyaltyResponse> redeem(@RequestHeader("X-User-Id") String customerId,
                                                                     @Valid @RequestBody ReferralCravesCoinsLoyaltyRequest request) {
        return ResponseEntity.ok(service.redeem(customerId, request));
    }
}
