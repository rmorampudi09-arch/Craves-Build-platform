package com.craves.order.dto;

import java.time.Instant;
import java.util.List;

public record ScheduledOrdersResponse(
        String orderId,
        String kitchenId,
        String customerId,
        String slotId,
        String deliveryDate,
        String slotLabel,
        String status,
        Instant reservationExpiresAt,
        List<Slot> availableSlots) {

    public record Slot(String slotId, String slotLabel, int capacityRemaining, Instant cutoffAt) {
    }
}
