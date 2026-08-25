package com.craves.order.repository;

import com.craves.order.entity.ScheduledOrders;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

@Repository
public class ScheduledOrdersRepository {

    private final Map<String, ScheduledOrders> reservations = new ConcurrentHashMap<>();

    public List<ScheduledOrders> findSlots(String kitchenId, String date) {
        return List.of(
                new ScheduledOrders("slot-1", kitchenId, null, "slot-1", date, "12:00 PM - 12:30 PM", "AVAILABLE", Instant.parse("2026-08-25T05:00:00Z")),
                new ScheduledOrders("slot-2", kitchenId, null, "slot-2", date, "01:00 PM - 01:30 PM", "AVAILABLE", Instant.parse("2026-08-25T06:00:00Z")));
    }

    public ScheduledOrders reserve(ScheduledOrders entity) {
        reservations.put(entity.orderId(), entity);
        return entity;
    }

    public ScheduledOrders findByOrderId(String orderId) {
        return reservations.getOrDefault(orderId, new ScheduledOrders(orderId, "kitchen-1", "customer-1", "slot-1", "2026-08-26", "12:00 PM - 12:30 PM", "RESERVED", Instant.now().plusSeconds(600)));
    }
}
