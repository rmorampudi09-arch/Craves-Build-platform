package in.craves.catalog.web;

import in.craves.catalog.config.PublicCatalogPrivacyProperties;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.service.DiscoveryCriteria;
import in.craves.catalog.service.DiscoveryCriteria.KitchenSort;
import in.craves.catalog.service.DiscoveryCriteria.MenuItemSort;
import in.craves.catalog.service.NearbyDiscoveryService;
import in.craves.catalog.web.ApiDtos.FoodType;
import in.craves.catalog.web.ApiDtos.SpiceLevel;
import in.craves.catalog.web.DiscoveryDtos.NearbyKitchenDiscoveryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyKitchenSummaryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyMenuItemDiscoveryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyMenuItemSummaryResponse;
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
    private final PublicCatalogPrivacyProperties privacyProperties;

    public NearbyDiscoveryController(
        NearbyDiscoveryService nearbyDiscoveryService,
        DiscoveryCacheService discoveryCacheService,
        PublicCatalogPrivacyProperties privacyProperties
    ) {
        this.nearbyDiscoveryService = nearbyDiscoveryService;
        this.discoveryCacheService = discoveryCacheService;
        this.privacyProperties = privacyProperties;
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
            query, category, foodType, minPrice, maxPrice, maxPreparationTimeMinutes, spiceLevel
        );
        boolean privacyEnabled = privacyProperties.isPrivacyEnforcementEnabled();
        String cacheKey = key(
            "kitchens", privacyEnabled, latitude, longitude, radiusMeters, query, category, foodType,
            minPrice, maxPrice, maxPreparationTimeMinutes, spiceLevel, sort, page, size
        );
        return discoveryCacheService.getOrLoad(
            cacheKey,
            NearbyKitchenDiscoveryResponse.class,
            () -> applyPrivacy(
                nearbyDiscoveryService.discoverKitchens(
                    latitude, longitude, radiusMeters, criteria, sort, page, size
                ),
                privacyEnabled
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
            query, category, foodType, minPrice, maxPrice, maxPreparationTimeMinutes, spiceLevel
        );
        boolean privacyEnabled = privacyProperties.isPrivacyEnforcementEnabled();
        String cacheKey = key(
            "menu-items", privacyEnabled, latitude, longitude, radiusMeters, query, category, foodType,
            minPrice, maxPrice, maxPreparationTimeMinutes, spiceLevel, sort, page, size
        );
        return discoveryCacheService.getOrLoad(
            cacheKey,
            NearbyMenuItemDiscoveryResponse.class,
            () -> applyPrivacy(
                nearbyDiscoveryService.discoverMenuItems(
                    latitude, longitude, radiusMeters, criteria, sort, page, size
                ),
                privacyEnabled
            )
        );
    }

    private static NearbyKitchenDiscoveryResponse applyPrivacy(
        NearbyKitchenDiscoveryResponse response,
        boolean privacyEnabled
    ) {
        return privacyEnabled ? sanitize(response) : response;
    }

    private static NearbyMenuItemDiscoveryResponse applyPrivacy(
        NearbyMenuItemDiscoveryResponse response,
        boolean privacyEnabled
    ) {
        return privacyEnabled ? sanitize(response) : response;
    }

    private static NearbyKitchenDiscoveryResponse sanitize(NearbyKitchenDiscoveryResponse response) {
        return new NearbyKitchenDiscoveryResponse(
            response.latitude(),
            response.longitude(),
            response.radiusMeters(),
            response.page(),
            response.kitchens().stream().map(kitchen -> new NearbyKitchenSummaryResponse(
                kitchen.id(),
                kitchen.kitchenName(),
                kitchen.displayName(),
                kitchen.description(),
                kitchen.areaName(),
                kitchen.city(),
                kitchen.state(),
                null,
                null,
                kitchen.distanceMeters(),
                kitchen.activeMenuItemCount()
            )).toList()
        );
    }

    private static NearbyMenuItemDiscoveryResponse sanitize(NearbyMenuItemDiscoveryResponse response) {
        return new NearbyMenuItemDiscoveryResponse(
            response.latitude(),
            response.longitude(),
            response.radiusMeters(),
            response.page(),
            response.menuItems().stream().map(item -> new NearbyMenuItemSummaryResponse(
                item.id(),
                item.kitchenId(),
                item.kitchenName(),
                item.kitchenDisplayName(),
                item.areaName(),
                item.city(),
                item.state(),
                null,
                null,
                item.distanceMeters(),
                item.itemName(),
                item.description(),
                item.category(),
                item.foodType(),
                item.price(),
                item.currency(),
                item.servesCount(),
                item.preparationTimeMinutes(),
                item.spiceLevel(),
                item.unitPackageWeightGrams(),
                item.thermoboxRequired(),
                item.primaryImageUrl()
            )).toList()
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
