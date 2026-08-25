package com.craves.order.controller;

import com.craves.order.dto.ScheduledOrdersRequest;
import com.craves.order.dto.ScheduledOrdersResponse;
import com.craves.order.service.ScheduledOrdersService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ScheduledOrdersController {

    private final ScheduledOrdersService service;

    public ScheduledOrdersController(ScheduledOrdersService service) {
        this.service = service;
    }

    @GetMapping("/orders/schedule/slots")
    public ResponseEntity<List<ScheduledOrdersResponse.Slot>> slots(@RequestParam String kitchenId, @RequestParam String date) {
        return ResponseEntity.ok(service.availableSlots(kitchenId, date));
    }

    @PostMapping("/checkout/scheduled")
    public ResponseEntity<ScheduledOrdersResponse> reserve(@Valid @RequestBody ScheduledOrdersRequest request) {
        return ResponseEntity.ok(service.reserveSchedule(request));
    }

    @GetMapping("/orders/{orderId}/scheduled")
    public ResponseEntity<ScheduledOrdersResponse> get(@PathVariable String orderId) {
        return ResponseEntity.ok(service.findByOrderId(orderId));
    }
}
