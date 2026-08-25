package com.craves.userchef.service;

import com.craves.userchef.dto.LoyaltyCoinsWalletRequest;
import com.craves.userchef.dto.LoyaltyCoinsWalletResponse;
import com.craves.userchef.entity.LoyaltyCoinsWallet;
import com.craves.userchef.repository.LoyaltyCoinsWalletRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class LoyaltyCoinsWalletService {

    private final LoyaltyCoinsWalletRepository repository;

    public LoyaltyCoinsWalletService(LoyaltyCoinsWalletRepository repository) {
        this.repository = repository;
    }

    public LoyaltyCoinsWalletResponse wallet(String customerId) {
        LoyaltyCoinsWallet wallet = repository.findByCustomerId(customerId);
        return new LoyaltyCoinsWalletResponse(wallet.customerId(), wallet.balanceCoins(), wallet.redeemableValue(), map(wallet.ledger()));
    }

    public LoyaltyCoinsWalletResponse redeem(LoyaltyCoinsWalletRequest request) {
        repository.appendLedger(request.customerId(), -request.coins(), "REDEEM", "Redeemed on checkout", Instant.now());
        return wallet(request.customerId());
    }

    public LoyaltyCoinsWalletResponse earn(LoyaltyCoinsWalletRequest request) {
        repository.appendLedger(request.customerId(), request.coins(), "EARN", request.reason(), Instant.now());
        return wallet(request.customerId());
    }

    private List<LoyaltyCoinsWalletResponse.LedgerEntry> map(List<LoyaltyCoinsWallet.LedgerEntry> entries) {
        return entries.stream().map(entry -> new LoyaltyCoinsWalletResponse.LedgerEntry(entry.type(), entry.coins(), entry.reason(), entry.occurredAt())).toList();
    }
}
