package com.craves.order.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record OffersCouponsPromotionsRequest(
        @NotBlank String customerId,
        @NotBlank String code,
        @Min(0) int cartTotal) {
}
