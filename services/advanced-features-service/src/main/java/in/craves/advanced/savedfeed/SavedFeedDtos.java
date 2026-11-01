package in.craves.advanced.savedfeed;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SavedFeedDtos {
    private SavedFeedDtos() { }

    /** timesOrdered/lastOrderedAt: from the caller's own delivered orders only (private; never shown to anyone else). */
    public record SavedDishFamiliarity(int timesOrdered, Instant lastOrderedAt) { }

    public record SavedDishAlternative(UUID menuItemId, String name, Long pricePaise) { }

    /**
     * For a favorite that cannot be bought now. kitchenCookingState is Catalog's state (COOKING_LATER_TODAY, NOT_TODAY, PAUSED, ...;
     * UNKNOWN when the dish's kitchen is not known here); alternatives are up to 3 dishes the same kitchen offers now. Nothing is
     * substituted automatically.
     */
    public record SavedDishRecovery(UUID kitchenId, String kitchenName, String kitchenCookingState, Instant nextAvailabilityAt,
                                    List<SavedDishAlternative> alternatives) { }

    /** name and pricePaise are Catalog's current values when available; for an unavailable dish name is the last one seen, price null. */
    public record SavedDishCard(UUID menuItemId, Instant savedAt, boolean available, String name, Long pricePaise, UUID kitchenId,
                                SavedDishFamiliarity familiarity, SavedDishRecovery recovery) { }

    /** savedAt is null for a regular (a kitchen ordered from but not saved). */
    public record SavedKitchenCard(UUID kitchenId, Instant savedAt, boolean exists, String name, String cookingState, Instant nextAvailabilityAt,
                                   boolean acceptingOrders, int availableDishCount, int deliveredOrders, Instant lastOrderedAt) { }

    /** familiarityComplete is false when the caller has more delivered orders than were read (counts are then lower bounds). */
    public record SavedFeedView(Instant evaluatedAt, List<SavedDishCard> dishes, List<SavedKitchenCard> kitchens, List<SavedKitchenCard> regulars,
                                boolean familiarityComplete) { }
}
