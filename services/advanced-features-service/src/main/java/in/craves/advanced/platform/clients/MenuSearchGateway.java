package in.craves.advanced.platform.clients;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Catalog's public nearby dish discovery ({@code GET /api/v1/discovery/menu-items}); Catalog stays the authority on what is shown. */
public interface MenuSearchGateway {
    /** text, foodType (VEG, NON_VEG, EGG), spiceLevel (MILD, MEDIUM, SPICY) and category are optional; Catalog validates everything. */
    record MenuSearch(BigDecimal latitude, BigDecimal longitude, int radiusMeters, String text, String foodType, String spiceLevel,
                      String category, int size) { }

    record FoundDish(UUID menuItemId, UUID kitchenId, String kitchenName, String itemName, String description, String category,
                     String foodType, String spiceLevel, Long pricePaise, long distanceMeters, String imageUrl) { }

    /** Catalog's order (nearest first by default). A request Catalog refuses answers 400 with Catalog's own code. */
    List<FoundDish> nearbyDishes(MenuSearch search);
}
