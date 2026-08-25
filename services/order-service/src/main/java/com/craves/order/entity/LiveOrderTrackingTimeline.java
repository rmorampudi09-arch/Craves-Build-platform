package com.craves.order.entity;

import java.time.Instant;
import java.util.List;

public record LiveOrderTrackingTimeline(
        String orderId,
        String currentStatus,
        int etaMinutes,
        String deliveryPartner,
        String mapUrl,
        List<Event> timeline) {

    public record Event(String status, String label, Instant occurredAt, boolean completed) {
    }
}
