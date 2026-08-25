package in.craves.order.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record LiveOrderTrackingTimelineResponse(
    UUID orderId,
    List<TimelineEvent> events
) {
    public record TimelineEvent(String status, String message, OffsetDateTime eventTime) {}
}
