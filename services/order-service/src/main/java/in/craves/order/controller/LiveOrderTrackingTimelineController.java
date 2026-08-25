package in.craves.order.controller;

import in.craves.order.dto.LiveOrderTrackingTimelineRequest;
import in.craves.order.dto.LiveOrderTrackingTimelineResponse;
import in.craves.order.service.LiveOrderTrackingTimelineService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class LiveOrderTrackingTimelineController {
    private final LiveOrderTrackingTimelineService service;
    public LiveOrderTrackingTimelineController(LiveOrderTrackingTimelineService service) { this.service = service; }

    @GetMapping("/{orderId}/timeline")
    public ResponseEntity<LiveOrderTrackingTimelineResponse> getTimeline(@PathVariable UUID orderId) {
        return ResponseEntity.ok(service.getTimeline(orderId));
    }

    @PostMapping("/timeline/events")
    public ResponseEntity<Void> append(@Valid @RequestBody LiveOrderTrackingTimelineRequest request) {
        service.append(request);
        return ResponseEntity.accepted().build();
    }
}
