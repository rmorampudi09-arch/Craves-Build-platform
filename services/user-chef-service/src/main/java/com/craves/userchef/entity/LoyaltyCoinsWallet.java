package com.craves.userchef.entity;

import java.time.Instant;
import java.util.List;

public record LoyaltyCoinsWallet(
        String customerId,
        int balanceCoins,
        int redeemableValue,
        List<LedgerEntry> ledger) {

    public record LedgerEntry(String type, int coins, String reason, Instant occurredAt) {
    }
}
