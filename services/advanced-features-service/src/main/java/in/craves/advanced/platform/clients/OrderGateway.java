package in.craves.advanced.platform.clients;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Read-only view of an order in Order service, always on behalf of the caller with their own token (Order service stays authoritative). */
public interface OrderGateway {
    /** unitPricePaise: the line's own price for one portion, before any order-wide discount. */
    record OrderLine(UUID id, UUID menuItemId, String name, long unitPricePaise, int quantity) { }

    /**
     * status is Order service's status name (PAID, CHEF_ACCEPTED, DELIVERED, ...), kept as text so new statuses never break a read.
     * grandTotalPaise (the order's total before wallet and referral discounts), createdAt (checkout) and updatedAt (its last change,
     * for a finished order about when it finished) are null when Order service does not give them in the expected form.
     */
    record Order(UUID id, UUID customerId, UUID kitchenId, String status, List<OrderLine> lines, Long grandTotalPaise, Instant createdAt,
                 Instant updatedAt) { }

    /** The signed-in customer's own order; empty when it does not exist or is not theirs. */
    Optional<Order> customerOrder(String customerBearerToken, UUID orderId);

    /** An order of the signed-in chef's kitchen; empty when it does not exist or belongs to another kitchen. */
    Optional<Order> chefOrder(String chefBearerToken, UUID orderId);
}
