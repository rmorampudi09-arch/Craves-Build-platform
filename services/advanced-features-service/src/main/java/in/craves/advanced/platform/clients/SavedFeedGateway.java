package in.craves.advanced.platform.clients;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Read-only sources of the Saved feed (M17), each owned by another service and read through the public gateway:
 * favorites from User-chef service (caller's token), kitchen cooking state from Catalog discovery, and the caller's
 * delivered-order history from Order service's repeat candidates (caller's token).
 */
public interface SavedFeedGateway {
    record SavedItem(UUID id, Instant savedAt) { }

    /** A dish Catalog shows on the kitchen card (active and available). */
    record PreviewDish(UUID menuItemId, String name, Long pricePaise) { }

    /** cookingState is Catalog's name (COOKING_NOW, COOKING_LATER_TODAY, NOT_TODAY, PAUSED, NOT_ACCEPTING, INACTIVE, MISSING), kept as text. */
    record KitchenState(UUID kitchenId, boolean exists, String name, String cookingState, Instant nextAvailabilityAt, boolean acceptingOrders,
                        int availableDishCount, List<PreviewDish> preview) { }

    record PastOrderItem(UUID menuItemId, String name, int quantity) { }

    /** One delivered order; completedOrdersFromKitchen is Order service's count of the caller's delivered orders from that kitchen. */
    record PastOrder(UUID orderId, UUID kitchenId, String kitchenName, Instant orderedAt, int completedOrdersFromKitchen, List<PastOrderItem> items) { }

    /** complete is false when the caller has more delivered orders than one page holds. */
    record History(List<PastOrder> orders, boolean complete) { }

    List<SavedItem> favoriteDishes(String customerBearerToken);

    /** The first page (up to 100) of favorite kitchens, newest first. */
    List<SavedItem> favoriteKitchens(String customerBearerToken);

    /** At most 100 kitchens per call; ids Catalog does not know come back with exists=false. */
    Map<UUID, KitchenState> kitchenStates(Collection<UUID> kitchenIds);

    /** The caller's most recent delivered orders (one page of up to 50). */
    History deliveredOrders(String customerBearerToken);
}
