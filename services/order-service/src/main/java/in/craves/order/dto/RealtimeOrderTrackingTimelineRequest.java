package in.craves.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record RealtimeOrderTrackingTimelineRequest(
        @NotBlank String status,
        @NotBlank @Size(max = 120) String title,
        @NotBlank @Size(max = 400) String description,
        LocalDateTime occurredAt,
        @NotBlank String actor,
        boolean live
) {}
