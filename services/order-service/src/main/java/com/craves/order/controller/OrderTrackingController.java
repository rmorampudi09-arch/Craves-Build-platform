package com.craves.order.controller;

import com.craves.order.dto.OrderTrackingRequest;
import com.craves.order.dto.OrderTrackingResponse;
import com.craves.order.service.OrderTrackingService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderTrackingController {
    private final OrderTrackingService orderTrackingService;
    public OrderTrackingController(OrderTrackingService orderTrackingService) {
        this.orderTrackingService = orderTrackingService;
    }
    @GetMapping("/{orderId}/tracking")
    public ResponseEntity<List<OrderTrackingResponse>> tracking(@PathVariable String orderId) {
        return ResponseEntity.ok(orderTrackingService.timeline(orderId));
    }
    @PostMapping("/{orderId}/status-events")
    public ResponseEntity<OrderTrackingResponse> append(@PathVariable String orderId, @Valid @RequestBody OrderTrackingRequest request) {
        return ResponseEntity.ok(orderTrackingService.append(orderId, request));
    }
}
