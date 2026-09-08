package in.craves.order.event;

import java.time.Instant;
import java.util.UUID;

public record OrderReadyForPickupEventData(
    UUID orderId,
    UUID chefSubOrderId,
    Instant readyAt
) {}
