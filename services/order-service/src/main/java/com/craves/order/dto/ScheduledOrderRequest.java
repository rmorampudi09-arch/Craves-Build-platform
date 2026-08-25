package com.craves.order.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ScheduledOrderRequest(
        @NotBlank String chefId,
        @NotBlank String cartId,
        @NotBlank String addressId,
        @NotNull LocalDateTime slotStart,
        @NotNull LocalDateTime slotEnd,
        @DecimalMin("0.0") BigDecimal orderValue,
        String notes) {
}
