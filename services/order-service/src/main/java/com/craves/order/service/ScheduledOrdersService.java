package com.craves.order.service;

import com.craves.order.dto.ScheduledOrdersRequest;
import com.craves.order.dto.ScheduledOrdersResponse;
import com.craves.order.entity.ScheduledOrders;
import com.craves.order.repository.ScheduledOrdersRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ScheduledOrdersService {

    private final ScheduledOrdersRepository repository;

    public ScheduledOrdersService(ScheduledOrdersRepository repository) {
        this.repository = repository;
    }

    public List<ScheduledOrdersResponse.Slot> availableSlots(String kitchenId, String date) {
        return repository.findSlots(kitchenId, date).stream()
                .map(slot -> new ScheduledOrdersResponse.Slot(slot.slotId(), slot.slotLabel(), slot.capacityRemaining(), slot.cutoffAt()))
                .toList();
    }

    public ScheduledOrdersResponse reserveSchedule(ScheduledOrdersRequest request) {
        ScheduledOrders entity = repository.reserve(new ScheduledOrders(
                request.orderId(),
                request.kitchenId(),
                request.customerId(),
                request.slotId(),
                request.deliveryDate(),
                request.slotLabel(),
                "RESERVED",
                Instant.now().plusSeconds(600)));
        return map(entity);
    }

    public ScheduledOrdersResponse findByOrderId(String orderId) {
        return map(repository.findByOrderId(orderId));
    }

    private ScheduledOrdersResponse map(ScheduledOrders entity) {
        return new ScheduledOrdersResponse(
                entity.orderId(),
                entity.kitchenId(),
                entity.customerId(),
                entity.slotId(),
                entity.deliveryDate(),
                entity.slotLabel(),
                entity.status(),
                entity.reservationExpiresAt(),
                availableSlots(entity.kitchenId(), entity.deliveryDate()));
    }
}
