package com.craves.userchef.controller;

import com.craves.userchef.dto.LoyaltyCoinsWalletRequest;
import com.craves.userchef.dto.LoyaltyCoinsWalletResponse;
import com.craves.userchef.service.LoyaltyCoinsWalletService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rewards")
public class LoyaltyCoinsWalletController {

    private final LoyaltyCoinsWalletService service;

    public LoyaltyCoinsWalletController(LoyaltyCoinsWalletService service) {
        this.service = service;
    }

    @GetMapping("/wallet")
    public ResponseEntity<LoyaltyCoinsWalletResponse> wallet(@RequestParam String customerId) {
        return ResponseEntity.ok(service.wallet(customerId));
    }

    @GetMapping("/ledger")
    public ResponseEntity<List<LoyaltyCoinsWalletResponse.LedgerEntry>> ledger(@RequestParam String customerId) {
        return ResponseEntity.ok(service.wallet(customerId).ledger());
    }

    @PostMapping("/redeem")
    public ResponseEntity<LoyaltyCoinsWalletResponse> redeem(@Valid @RequestBody LoyaltyCoinsWalletRequest request) {
        return ResponseEntity.ok(service.redeem(request));
    }

    @PostMapping("/earn/internal")
    public ResponseEntity<LoyaltyCoinsWalletResponse> earn(@Valid @RequestBody LoyaltyCoinsWalletRequest request) {
        return ResponseEntity.ok(service.earn(request));
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, Integer>> config() {
        return ResponseEntity.ok(Map.of("coinsPerRupee", 1, "minimumRedeemCoins", 50, "maxRedeemPercent", 20));
    }
}
