package com.craves.order.service;

import com.craves.order.dto.OrderTrackingRequest;
import com.craves.order.dto.OrderTrackingResponse;
import com.craves.order.entity.OrderTracking;
import com.craves.order.repository.OrderTrackingRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderTrackingService {
    private final OrderTrackingRepository orderTrackingRepository;
    public OrderTrackingService(OrderTrackingRepository orderTrackingRepository) {
        this.orderTrackingRepository = orderTrackingRepository;
    }
    @Transactional(readOnly = true)
    public List<OrderTrackingResponse> timeline(String orderId) {
        return orderTrackingRepository.findByOrderIdOrderByOccurredAtAsc(orderId)
                .stream()
                .map(event -> new OrderTrackingResponse(event.getId(), event.getOrderId(), event.getStatus(), event.getDescription(), event.getSource(), event.getOccurredAt()))
                .collect(Collectors.toList());
    }
    @Transactional
    public OrderTrackingResponse append(String orderId, OrderTrackingRequest request) {
        OrderTracking event = new OrderTracking();
        event.setId(UUID.randomUUID().toString());
        event.setOrderId(orderId);
        event.setStatus(request.status());
        event.setDescription(request.description());
        event.setSource(request.source());
        event.setOccurredAt(request.occurredAt() == null ? LocalDateTime.now() : request.occurredAt());
        orderTrackingRepository.save(event);
        return new OrderTrackingResponse(event.getId(), orderId, event.getStatus(), event.getDescription(), event.getSource(), event.getOccurredAt());
    }
}
