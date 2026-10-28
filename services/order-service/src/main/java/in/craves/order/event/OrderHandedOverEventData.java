package in.craves.order.event;

import java.time.Instant;
import java.util.UUID;

/** orderId is the delivery checkout id, as in ORDER_READY_FOR_PICKUP; chefSubOrderId the chef's order. */
public record OrderHandedOverEventData(
    UUID orderId,
    UUID chefSubOrderId,
    Instant handedOverAt
) {}
