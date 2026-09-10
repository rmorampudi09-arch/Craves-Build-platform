package in.craves.order.schedule;

import java.time.Instant;
import java.util.UUID;

public record ScheduledOrderCursor(Instant requestedAt, UUID scheduleRequestId, UUID orderId) {
}
