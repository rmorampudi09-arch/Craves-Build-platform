package in.craves.order.event;

import java.time.Instant;
import java.util.UUID;

/**
 * checkoutId is the delivery checkout id (a meal-plan order stands in for its own, as in ORDER_READY_FOR_PICKUP);
 * chefSubOrderId the chef's order; reason a short code such as CUSTOMER_CANCELLED.
 */
public record OrderCancelledEventData(
    UUID checkoutId,
    UUID chefSubOrderId,
    String reason,
    Instant cancelledAt
) {}
