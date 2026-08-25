package com.craves.order.controller;

import com.craves.order.dto.LiveOrderTrackingTimelineRequest;
import com.craves.order.dto.LiveOrderTrackingTimelineResponse;
import com.craves.order.service.LiveOrderTrackingTimelineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class LiveOrderTrackingTimelineController {

    private final LiveOrderTrackingTimelineService service;

    public LiveOrderTrackingTimelineController(LiveOrderTrackingTimelineService service) {
        this.service = service;
    }

    @GetMapping("/{orderId}/tracking")
    public ResponseEntity<LiveOrderTrackingTimelineResponse> tracking(@PathVariable String orderId) {
        return ResponseEntity.ok(service.tracking(new LiveOrderTrackingTimelineRequest(orderId)));
    }

    @GetMapping("/{orderId}/timeline")
    public ResponseEntity<LiveOrderTrackingTimelineResponse> timeline(@PathVariable String orderId) {
        return ResponseEntity.ok(service.tracking(new LiveOrderTrackingTimelineRequest(orderId)));
    }

    @GetMapping("/{orderId}/eta")
    public ResponseEntity<Integer> eta(@PathVariable String orderId) {
        return ResponseEntity.ok(service.tracking(new LiveOrderTrackingTimelineRequest(orderId)).etaMinutes());
    }
}
