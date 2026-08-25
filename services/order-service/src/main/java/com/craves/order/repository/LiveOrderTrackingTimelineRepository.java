package com.craves.order.repository;

import com.craves.order.entity.LiveOrderTrackingTimeline;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class LiveOrderTrackingTimelineRepository {

    public LiveOrderTrackingTimeline findByOrderId(String orderId) {
        return new LiveOrderTrackingTimeline(
                orderId,
                "OUT_FOR_DELIVERY",
                12,
                "Shiprocket",
                "https://maps.craves.app/orders/" + orderId,
                List.of(
                        new LiveOrderTrackingTimeline.Event("PLACED", "Order placed", Instant.parse("2026-08-25T10:00:00Z"), true),
                        new LiveOrderTrackingTimeline.Event("CHEF_ACCEPTED", "Chef accepted", Instant.parse("2026-08-25T10:02:00Z"), true),
                        new LiveOrderTrackingTimeline.Event("PREPARING", "Meal is being prepared", Instant.parse("2026-08-25T10:15:00Z"), true),
                        new LiveOrderTrackingTimeline.Event("PICKED_UP", "Delivery partner picked up the order", Instant.parse("2026-08-25T10:36:00Z"), true),
                        new LiveOrderTrackingTimeline.Event("OUT_FOR_DELIVERY", "Partner is nearby", Instant.parse("2026-08-25T10:44:00Z"), true),
                        new LiveOrderTrackingTimeline.Event("DELIVERED", "Delivered", Instant.parse("2026-08-25T10:56:00Z"), false)));
    }
}
