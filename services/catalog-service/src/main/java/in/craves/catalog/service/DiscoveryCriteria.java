package in.craves.catalog.service;

import in.craves.catalog.web.ApiDtos.FoodType;
import in.craves.catalog.web.ApiDtos.SpiceLevel;
import java.math.BigDecimal;

public record DiscoveryCriteria(
    String query,
    String category,
    FoodType foodType,
    BigDecimal minPrice,
    BigDecimal maxPrice,
    Integer maxPreparationTimeMinutes,
    SpiceLevel spiceLevel
) {
    public static DiscoveryCriteria empty() {
        return new DiscoveryCriteria(null, null, null, null, null, null, null);
    }

    public enum KitchenSort {
        DISTANCE_ASC,
        NAME_ASC
    }

    public enum MenuItemSort {
        DISTANCE_ASC,
        PRICE_ASC,
        PRICE_DESC,
        PREPARATION_TIME_ASC,
        NAME_ASC
    }
}
