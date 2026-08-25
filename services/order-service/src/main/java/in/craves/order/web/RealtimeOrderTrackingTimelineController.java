package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.RealtimeOrderTrackingTimelineService;
import in.craves.order.web.RealtimeOrderTrackingTimelineDtos.TimelineResponse;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
public class RealtimeOrderTrackingTimelineController {
    private final RealtimeOrderTrackingTimelineService timelineService;

    public RealtimeOrderTrackingTimelineController(RealtimeOrderTrackingTimelineService timelineService) {
        this.timelineService = timelineService;
    }

    @GetMapping("/{orderId}/timeline")
    public TimelineResponse getTimeline(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId
    ) {
        return timelineService.getTimeline(principal, orderId);
    }
}
