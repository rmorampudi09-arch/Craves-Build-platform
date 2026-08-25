package in.craves.order.dto;

import java.time.LocalDateTime;

public record RealtimeOrderTrackingTimelineResponse(
        Long id,
        Long orderId,
        String status,
        String title,
        String description,
        LocalDateTime occurredAt,
        String actor,
        boolean live
) {}
