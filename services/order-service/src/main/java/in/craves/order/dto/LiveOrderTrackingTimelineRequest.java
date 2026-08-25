package in.craves.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import java.util.UUID;

public record LiveOrderTrackingTimelineRequest(
    @NotNull UUID orderId,
    @NotBlank String status,
    @NotBlank String message,
    @NotNull OffsetDateTime eventTime
) {}
