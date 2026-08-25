package com.craves.order.dto;

import java.time.Instant;
import java.util.List;

public record LiveOrderTrackingTimelineResponse(
        String orderId,
        String currentStatus,
        int etaMinutes,
        String deliveryPartner,
        String mapUrl,
        List<TimelineEvent> timeline) {

    public record TimelineEvent(String status, String label, Instant occurredAt, boolean completed) {
    }
}
