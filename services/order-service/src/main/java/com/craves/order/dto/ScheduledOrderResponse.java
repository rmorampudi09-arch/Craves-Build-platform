package com.craves.order.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ScheduledOrderResponse(
        String orderId,
        String customerId,
        String chefId,
        String cartId,
        String addressId,
        LocalDateTime slotStart,
        LocalDateTime slotEnd,
        String status,
        BigDecimal orderValue,
        String message) {
}
