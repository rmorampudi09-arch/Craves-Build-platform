package in.craves.catalog.web;

import in.craves.catalog.config.PublicCatalogPrivacyProperties;
import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.PublicMenuBatchResolveService;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import in.craves.catalog.web.ApiDtos.MenuItemImageResponse;
import in.craves.catalog.web.ApiDtos.MenuItemResponse;
import in.craves.catalog.web.ApiDtos.PublicKitchenDiscoveryResponse;
import in.craves.catalog.web.ApiDtos.PublicKitchenSummaryResponse;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolveMenuItemsRequest;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolvedMenuItemResponse;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog")
public class PublicCatalogController {
    private final CatalogService catalogService;
    private final PublicMenuBatchResolveService publicMenuBatchResolveService;
    private final PublicCatalogPrivacyProperties privacyProperties;

    public PublicCatalogController(
        CatalogService catalogService,
        PublicMenuBatchResolveService publicMenuBatchResolveService,
        PublicCatalogPrivacyProperties privacyProperties
    ) {
        this.catalogService = catalogService;
        this.publicMenuBatchResolveService = publicMenuBatchResolveService;
        this.privacyProperties = privacyProperties;
    }

    @GetMapping("/kitchens")
    public PublicKitchenDiscoveryResponse discoverKitchens(
        @RequestParam(required = false) BigDecimal latitude,
        @RequestParam(required = false) BigDecimal longitude,
        @RequestParam(required = false) String city,
        @RequestParam(required = false) String areaName,
        @RequestParam(required = false) BigDecimal radiusKm
    ) {
        PublicKitchenDiscoveryResponse response = catalogService.discoverKitchens(
            latitude,
            longitude,
            city,
            areaName,
            radiusKm
        );
        if (!privacyProperties.isPrivacyEnforcementEnabled()) {
            return response;
        }
        return new PublicKitchenDiscoveryResponse(
            response.radius(),
            response.kitchens().stream().map(PublicCatalogController::sanitizeKitchenSummary).toList()
        );
    }

    @GetMapping("/kitchens/{kitchenId}")
    public KitchenProfileResponse getKitchen(@PathVariable UUID kitchenId) {
        KitchenProfileResponse kitchen = catalogService.getPublicKitchen(kitchenId);
        return privacyProperties.isPrivacyEnforcementEnabled()
            ? sanitizeKitchenProfile(kitchen)
            : kitchen;
    }

    @GetMapping("/kitchens/{kitchenId}/menu-items")
    public List<MenuItemResponse> getKitchenMenuItems(@PathVariable UUID kitchenId) {
        List<MenuItemResponse> items = catalogService.getPublicMenuItems(kitchenId);
        if (!privacyProperties.isPrivacyEnforcementEnabled()) {
            return items;
        }
        return items.stream().map(PublicCatalogController::sanitizeMenuItem).toList();
    }

    @GetMapping("/menu-items/{menuItemId}")
    public MenuItemResponse getMenuItem(@PathVariable UUID menuItemId) {
        MenuItemResponse item = catalogService.getPublicMenuItem(menuItemId);
        return privacyProperties.isPrivacyEnforcementEnabled() ? sanitizeMenuItem(item) : item;
    }

    @PostMapping("/menu-items/resolve")
    public List<ResolvedMenuItemResponse> resolveMenuItems(
        @Valid @RequestBody ResolveMenuItemsRequest request
    ) {
        return publicMenuBatchResolveService.resolve(request);
    }

    private static KitchenProfileResponse sanitizeKitchenProfile(KitchenProfileResponse kitchen) {
        return new KitchenProfileResponse(
            kitchen.id(),
            null,
            kitchen.kitchenName(),
            kitchen.displayName(),
            kitchen.description(),
            null,
            null,
            null,
            null,
            null,
            kitchen.areaName(),
            kitchen.city(),
            kitchen.state(),
            null,
            null,
            null,
            kitchen.status(),
            null,
            null
        );
    }

    private static PublicKitchenSummaryResponse sanitizeKitchenSummary(PublicKitchenSummaryResponse kitchen) {
        return new PublicKitchenSummaryResponse(
            kitchen.id(),
            kitchen.kitchenName(),
            kitchen.displayName(),
            kitchen.description(),
            kitchen.areaName(),
            kitchen.city(),
            null,
            null,
            kitchen.distanceKm(),
            kitchen.activeMenuItemCount()
        );
    }

    private static MenuItemResponse sanitizeMenuItem(MenuItemResponse item) {
        List<MenuItemImageResponse> images = item.images() == null
            ? List.of()
            : item.images().stream().map(PublicCatalogController::sanitizeImage).toList();
        return new MenuItemResponse(
            item.id(),
            item.kitchenId(),
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
            item.available(),
            item.status(),
            images,
            item.createdAt(),
            item.updatedAt()
        );
    }

    private static MenuItemImageResponse sanitizeImage(MenuItemImageResponse image) {
        return new MenuItemImageResponse(
            image.id(),
            image.menuItemId(),
            null,
            null,
            image.contentType(),
            image.fileSizeBytes(),
            image.publicUrl(),
            image.sortOrder(),
            image.primary(),
            image.createdAt()
        );
    }
}
