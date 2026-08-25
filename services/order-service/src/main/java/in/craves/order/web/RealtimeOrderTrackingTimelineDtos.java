package in.craves.order.web;

import in.craves.order.web.ApiDtos.OrderStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RealtimeOrderTrackingTimelineDtos {
    private RealtimeOrderTrackingTimelineDtos() {
    }

    public record TimelineEventResponse(
        UUID id,
        OrderStatus status,
        Instant occurredAt
    ) {
    }

    public record TimelineResponse(
        UUID orderId,
        OrderStatus currentStatus,
        Instant createdAt,
        Instant updatedAt,
        List<TimelineEventResponse> events
    ) {
    }
}
