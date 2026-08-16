package in.craves.catalog.web;

import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.KitchenPickupLocationService;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import in.craves.catalog.web.ApiDtos.MenuItemResponse;
import in.craves.catalog.web.ApiDtos.PublicKitchenDetailResponse;
import in.craves.catalog.web.ApiDtos.PublicKitchenDiscoveryResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog")
public class PublicCatalogController {
    private final CatalogService catalogService;
    private final KitchenPickupLocationService pickupLocationService;

    public PublicCatalogController(
        CatalogService catalogService,
        KitchenPickupLocationService pickupLocationService
    ) {
        this.catalogService = catalogService;
        this.pickupLocationService = pickupLocationService;
    }

    @GetMapping("/kitchens")
    public PublicKitchenDiscoveryResponse discoverKitchens(
        @RequestParam(required = false) BigDecimal latitude,
        @RequestParam(required = false) BigDecimal longitude,
        @RequestParam(required = false) String city,
        @RequestParam(required = false) String areaName,
        @RequestParam(required = false) BigDecimal radiusKm
    ) {
        return catalogService.discoverKitchens(latitude, longitude, city, areaName, radiusKm);
    }

    @GetMapping("/kitchens/{kitchenId}")
    public PublicKitchenDetailResponse getKitchen(@PathVariable UUID kitchenId) {
        KitchenProfileResponse kitchen = catalogService.getPublicKitchen(kitchenId);
        return PublicKitchenDetailResponse.from(
            kitchen,
            pickupLocationService.currentPickupLocationId(kitchenId)
        );
    }

    @GetMapping("/kitchens/{kitchenId}/menu-items")
    public List<MenuItemResponse> getKitchenMenuItems(@PathVariable UUID kitchenId) {
        return catalogService.getPublicMenuItems(kitchenId);
    }

    @GetMapping("/menu-items/{menuItemId}")
    public MenuItemResponse getMenuItem(@PathVariable UUID menuItemId) {
        return catalogService.getPublicMenuItem(menuItemId);
    }
}
