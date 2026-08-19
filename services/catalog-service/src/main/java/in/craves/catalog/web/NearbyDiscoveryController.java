package in.craves.catalog.web;

import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.service.DiscoveryCriteria;
import in.craves.catalog.service.DiscoveryCriteria.KitchenSort;
import in.craves.catalog.service.DiscoveryCriteria.MenuItemSort;
import in.craves.catalog.service.NearbyDiscoveryService;
import in.craves.catalog.web.ApiDtos.FoodType;
import in.craves.catalog.web.ApiDtos.SpiceLevel;
import in.craves.catalog.web.DiscoveryDtos.NearbyKitchenDiscoveryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyMenuItemDiscoveryResponse;
import java.math.BigDecimal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/discovery")
public class NearbyDiscoveryController {
    private final NearbyDiscoveryService nearbyDiscoveryService;
    private final DiscoveryCacheService discoveryCacheService;

    public NearbyDiscoveryController(
        NearbyDiscoveryService nearbyDiscoveryService,
        DiscoveryCacheService discoveryCacheService
    ) {
        this.nearbyDiscoveryService = nearbyDiscoveryService;
        this.discoveryCacheService = discoveryCacheService;
    }

    @GetMapping("/kitchens")
    public NearbyKitchenDiscoveryResponse discoverKitchens(
        @RequestParam BigDecimal latitude,
        @RequestParam BigDecimal longitude,
        @RequestParam int radiusMeters,
        @RequestParam(required = false) String query,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) FoodType foodType,
        @RequestParam(required = false) BigDecimal minPrice,
        @RequestParam(required = false) BigDecimal maxPrice,
        @RequestParam(required = false) Integer maxPreparationTimeMinutes,
        @RequestParam(required = false) SpiceLevel spiceLevel,
        @RequestParam(defaultValue = "DISTANCE_ASC") KitchenSort sort,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        DiscoveryCriteria criteria = new DiscoveryCriteria(
            query,
            category,
            foodType,
            minPrice,
            maxPrice,
            maxPreparationTimeMinutes,
            spiceLevel
        );
        String cacheKey = key(
            "kitchens", latitude, longitude, radiusMeters, query, category, foodType,
            minPrice, maxPrice, maxPreparationTimeMinutes, spiceLevel, sort, page, size
        );
        return discoveryCacheService.getOrLoad(
            cacheKey,
            NearbyKitchenDiscoveryResponse.class,
            () -> nearbyDiscoveryService.discoverKitchens(
                latitude, longitude, radiusMeters, criteria, sort, page, size
            )
        );
    }

    @GetMapping("/menu-items")
    public NearbyMenuItemDiscoveryResponse discoverMenuItems(
        @RequestParam BigDecimal latitude,
        @RequestParam BigDecimal longitude,
        @RequestParam int radiusMeters,
        @RequestParam(required = false) String query,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) FoodType foodType,
        @RequestParam(required = false) BigDecimal minPrice,
        @RequestParam(required = false) BigDecimal maxPrice,
        @RequestParam(required = false) Integer maxPreparationTimeMinutes,
        @RequestParam(required = false) SpiceLevel spiceLevel,
        @RequestParam(defaultValue = "DISTANCE_ASC") MenuItemSort sort,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        DiscoveryCriteria criteria = new DiscoveryCriteria(
            query,
            category,
            foodType,
            minPrice,
            maxPrice,
            maxPreparationTimeMinutes,
            spiceLevel
        );
        String cacheKey = key(
            "menu-items", latitude, longitude, radiusMeters, query, category, foodType,
            minPrice, maxPrice, maxPreparationTimeMinutes, spiceLevel, sort, page, size
        );
        return discoveryCacheService.getOrLoad(
            cacheKey,
            NearbyMenuItemDiscoveryResponse.class,
            () -> nearbyDiscoveryService.discoverMenuItems(
                latitude, longitude, radiusMeters, criteria, sort, page, size
            )
        );
    }

    private static String key(String resource, Object... values) {
        StringBuilder builder = new StringBuilder(resource);
        for (Object value : values) {
            builder.append('|').append(value == null ? "" : value.toString());
        }
        return builder.toString();
    }
}
