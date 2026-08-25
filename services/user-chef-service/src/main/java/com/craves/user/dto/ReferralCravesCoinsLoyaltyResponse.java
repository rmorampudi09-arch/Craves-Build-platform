package com.craves.user.dto;

import java.time.LocalDateTime;

public record ReferralCravesCoinsLoyaltyResponse(String id, String customerId, String activityType, String referenceCode, int coinsDelta, int balanceAfter, LocalDateTime createdAt) {}
