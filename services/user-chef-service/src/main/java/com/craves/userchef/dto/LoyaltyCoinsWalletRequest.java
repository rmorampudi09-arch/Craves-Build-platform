package com.craves.userchef.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record LoyaltyCoinsWalletRequest(
        @NotBlank String customerId,
        @Min(1) int coins,
        @NotBlank String reason) {
}
