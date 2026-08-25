package com.craves.user.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record ReferralCravesCoinsLoyaltyRequest(@NotBlank String activityType, @NotBlank String referenceCode, @Min(1) int coins) {}
