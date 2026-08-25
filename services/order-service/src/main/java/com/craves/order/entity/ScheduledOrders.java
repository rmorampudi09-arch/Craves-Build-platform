package com.craves.order.entity;

import java.time.Instant;

public record ScheduledOrders(
        String orderId,
        String kitchenId,
        String customerId,
        String slotId,
        String deliveryDate,
        String slotLabel,
        String status,
        Instant reservationExpiresAt) {

    public int capacityRemaining() {
        return "AVAILABLE".equals(status) ? 12 : 0;
    }

    public Instant cutoffAt() {
        return reservationExpiresAt;
    }
}
