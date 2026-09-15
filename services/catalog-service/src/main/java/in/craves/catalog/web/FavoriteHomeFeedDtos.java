package in.craves.catalog.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class FavoriteHomeFeedDtos {
    private FavoriteHomeFeedDtos() {
    }

    public enum RequestedFavoriteType {
        CHEF,
        KITCHEN
    }

    public enum FavoriteCookingState {
        COOKING_NOW,
        COOKING_LATER_TODAY,
        NOT_TODAY,
        PAUSED,
        NOT_ACCEPTING,
        INACTIVE,
        MISSING
    }

    public record ResolveFavoriteHomeRequest(
        List<UUID> chefIdentityIds,
        List<UUID> kitchenIds
    ) {
    }

    public record FavoriteMenuPreview(
        UUID menuItemId,
        String itemName,
        String category,
        String foodType,
        BigDecimal price,
        String currency,
        String imageUrl
    ) {
    }

    public record FavoriteHomeCard(
        RequestedFavoriteType requestedType,
        UUID requestedId,
        boolean exists,
        UUID kitchenId,
        UUID chefIdentityId,
        String kitchenName,
        String displayName,
        String kitchenStatus,
        String areaName,
        String city,
        String state,
        int activeAvailableDishCount,
        List<FavoriteMenuPreview> menuPreview,
        String timezoneId,
        boolean scheduleConfigured,
        boolean acceptingOrders,
        boolean paused,
        FavoriteCookingState cookingState,
        Instant nextAvailabilityAt,
        Instant evaluatedAt
    ) {
    }

    public record ResolveFavoriteHomeResponse(
        Instant evaluatedAt,
        List<FavoriteHomeCard> items
    ) {
    }
}
