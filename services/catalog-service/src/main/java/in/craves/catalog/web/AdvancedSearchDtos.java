package in.craves.catalog.web;

import in.craves.catalog.web.ApiDtos.FoodType;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public final class AdvancedSearchDtos {
    private AdvancedSearchDtos() {
    }

    public record SearchItemResponse(
        UUID id,
        UUID kitchenId,
        String kitchenName,
        String kitchenDisplayName,
        String areaName,
        String city,
        long distanceMeters,
        String itemName,
        String description,
        String category,
        FoodType foodType,
        BigDecimal price,
        String currency,
        Integer preparationTimeMinutes,
        String primaryImageUrl
    ) {
    }

    public record SearchResponse(
        int page,
        int size,
        long totalElements,
        long totalPages,
        boolean hasNext,
        List<SearchItemResponse> items
    ) {
    }
}
