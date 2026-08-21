package in.craves.catalog.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SavedMenuItemDtos {
    private SavedMenuItemDtos() {
    }

    public enum SavedAvailabilityState {
        AVAILABLE_NOW,
        COOKING_LATER_TODAY,
        NOT_TODAY,
        PAUSED,
        KITCHEN_NOT_ACCEPTING,
        ITEM_UNAVAILABLE,
        RETIRED,
        KITCHEN_INACTIVE,
        MISSING
    }

    public record ResolveSavedMenuItemsRequest(List<UUID> menuItemIds) {
    }

    public record SavedMenuItemResponse(
        UUID menuItemId,
        boolean found,
        SavedAvailabilityState availabilityState,
        Instant evaluatedAt,
        String itemName,
        String description,
        String category,
        String foodType,
        BigDecimal price,
        String currency,
        String itemStatus,
        boolean itemAvailable,
        UUID kitchenId,
        String kitchenName,
        String kitchenDisplayName,
        String kitchenStatus,
        String areaName,
        String city,
        String state,
        String primaryImageUrl,
        String timezoneId,
        boolean scheduleConfigured,
        boolean acceptingOrders,
        boolean paused,
        boolean availableNow,
        Instant nextAvailabilityAt
    ) {
    }

    public record ResolveSavedMenuItemsResponse(
        Instant evaluatedAt,
        List<SavedMenuItemResponse> items
    ) {
    }
}
