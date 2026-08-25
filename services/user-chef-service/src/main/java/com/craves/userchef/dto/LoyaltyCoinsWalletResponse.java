package com.craves.userchef.dto;

import java.time.Instant;
import java.util.List;

public record LoyaltyCoinsWalletResponse(
        String customerId,
        int balanceCoins,
        int redeemableValue,
        List<LedgerEntry> ledger) {

    public record LedgerEntry(String type, int coins, String reason, Instant occurredAt) {
    }
}
