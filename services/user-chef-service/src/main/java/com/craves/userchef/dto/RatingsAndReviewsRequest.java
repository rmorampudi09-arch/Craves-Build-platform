package com.craves.userchef.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record RatingsAndReviewsRequest(
        @NotBlank String reviewId,
        @NotBlank String orderId,
        @NotBlank String kitchenId,
        @NotBlank String dishId,
        @NotBlank String chefId,
        @NotBlank String customerName,
        @Min(1) @Max(5) int rating,
        @NotBlank String comment) {
}
