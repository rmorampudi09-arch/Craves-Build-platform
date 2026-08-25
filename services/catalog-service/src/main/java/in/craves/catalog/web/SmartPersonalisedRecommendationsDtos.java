package in.craves.catalog.web;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public final class SmartPersonalisedRecommendationsDtos {
    private SmartPersonalisedRecommendationsDtos() {
    }

    public record ResolveRecommendationsRequest(List<UUID> seedMenuItemIds) {
    }

    public record RecommendationItem(
        UUID menuItemId,
        UUID kitchenId,
        String kitchenName,
        String kitchenDisplayName,
        String areaName,
        String city,
        String itemName,
        String description,
        String category,
        String foodType,
        BigDecimal price,
        String currency,
        Integer preparationTimeMinutes,
        String primaryImageUrl,
        String reasonCode
    ) {
    }

    public record ResolveRecommendationsResponse(List<RecommendationItem> items) {
    }
}
