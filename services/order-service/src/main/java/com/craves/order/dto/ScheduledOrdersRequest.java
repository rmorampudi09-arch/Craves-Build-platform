package com.craves.order.dto;

import jakarta.validation.constraints.NotBlank;

public record ScheduledOrdersRequest(
        @NotBlank String orderId,
        @NotBlank String kitchenId,
        @NotBlank String customerId,
        @NotBlank String slotId,
        @NotBlank String deliveryDate,
        @NotBlank String slotLabel) {
}
