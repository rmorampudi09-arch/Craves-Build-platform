package in.craves.order.controller;

import in.craves.order.dto.RealtimeOrderTrackingTimelineRequest;
import in.craves.order.dto.RealtimeOrderTrackingTimelineResponse;
import in.craves.order.service.RealtimeOrderTrackingTimelineService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
@Validated
public class RealtimeOrderTrackingTimelineController {

    private final RealtimeOrderTrackingTimelineService trackingService;

    public RealtimeOrderTrackingTimelineController(RealtimeOrderTrackingTimelineService trackingService) {
        this.trackingService = trackingService;
    }

    @GetMapping("/{orderId}/timeline")
    public List<RealtimeOrderTrackingTimelineResponse> getTimeline(@RequestHeader("X-Customer-Id") Long customerId,
                                                                   @PathVariable Long orderId) {
        return trackingService.getTimeline(customerId, orderId);
    }

    @PostMapping("/{orderId}/timeline")
    @ResponseStatus(HttpStatus.CREATED)
    public RealtimeOrderTrackingTimelineResponse addTimelineEvent(@RequestHeader("X-Customer-Id") Long customerId,
                                                                  @PathVariable Long orderId,
                                                                  @Valid @RequestBody RealtimeOrderTrackingTimelineRequest request) {
        return trackingService.addTimelineEvent(customerId, orderId, request);
    }
}
