package com.craves.userchef.repository;

import com.craves.userchef.entity.LoyaltyCoinsWallet;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

@Repository
public class LoyaltyCoinsWalletRepository {

    private final Map<String, List<LoyaltyCoinsWallet.LedgerEntry>> ledger = new ConcurrentHashMap<>();

    public LoyaltyCoinsWallet findByCustomerId(String customerId) {
        List<LoyaltyCoinsWallet.LedgerEntry> entries = ledger.computeIfAbsent(customerId, key -> new ArrayList<>(List.of(
                new LoyaltyCoinsWallet.LedgerEntry("EARN", 80, "Completed order", Instant.parse("2026-08-20T10:00:00Z")),
                new LoyaltyCoinsWallet.LedgerEntry("EARN", 40, "Chef follow campaign", Instant.parse("2026-08-22T10:00:00Z")))));
        int balance = entries.stream().mapToInt(LoyaltyCoinsWallet.LedgerEntry::coins).sum();
        return new LoyaltyCoinsWallet(customerId, balance, balance / 4, List.copyOf(entries));
    }

    public void appendLedger(String customerId, int coins, String type, String reason, Instant occurredAt) {
        ledger.computeIfAbsent(customerId, key -> new ArrayList<>()).add(new LoyaltyCoinsWallet.LedgerEntry(type, coins, reason, occurredAt));
    }
}
