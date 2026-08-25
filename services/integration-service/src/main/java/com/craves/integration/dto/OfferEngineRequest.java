package com.craves.integration.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record OfferEngineRequest(
        @NotBlank String cartId,
        @NotBlank String couponCode,
        @NotNull @DecimalMin("0.0") BigDecimal cartValue) {
}
