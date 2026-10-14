package in.craves.catalog.web;

import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.BulkMenuAvailabilityService;
import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.web.ApiDtos.AvailabilityRequest;
import in.craves.catalog.web.ApiDtos.ChefAvatarRequest;
import in.craves.catalog.web.ApiDtos.KitchenPhotoKind;
import in.craves.catalog.web.ApiDtos.KitchenProfileRequest;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import in.craves.catalog.web.ApiDtos.KitchenSettings;
import in.craves.catalog.web.ApiDtos.MenuItemImageResponse;
import in.craves.catalog.web.ApiDtos.MenuItemRequest;
import in.craves.catalog.web.ApiDtos.MenuItemResponse;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.BulkAvailabilityRequest;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.BulkAvailabilityResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/kitchens/me")
public class KitchenController {
    private final CatalogService catalogService;
    private final BulkMenuAvailabilityService bulkMenuAvailabilityService;
    private final DiscoveryCacheService discoveryCacheService;

    public KitchenController(
        CatalogService catalogService,
        BulkMenuAvailabilityService bulkMenuAvailabilityService,
        DiscoveryCacheService discoveryCacheService
    ) {
        this.catalogService = catalogService;
        this.bulkMenuAvailabilityService = bulkMenuAvailabilityService;
        this.discoveryCacheService = discoveryCacheService;
    }

    @GetMapping
    public KitchenProfileResponse getMyKitchen(@AuthenticationPrincipal CravesPrincipal principal) {
        return catalogService.getMyKitchen(principal);
    }

    @PutMapping
    public KitchenProfileResponse upsertMyKitchen(
        @AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody KitchenProfileRequest request
    ) {
        KitchenProfileResponse response = catalogService.upsertMyKitchen(principal, request);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @PostMapping("/photos")
    public KitchenProfileResponse uploadPhoto(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam KitchenPhotoKind kind,
        @RequestParam MultipartFile file
    ) {
        return catalogService.uploadKitchenPhoto(principal, kind, file);
    }

    @PutMapping("/chef-avatar")
    public KitchenProfileResponse setChefAvatar(
        @AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody ChefAvatarRequest request
    ) {
        KitchenProfileResponse response = catalogService.setChefAvatar(principal, request.avatarId());
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @DeleteMapping("/photos/{kind}")
    public KitchenProfileResponse deletePhoto(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable KitchenPhotoKind kind
    ) {
        KitchenProfileResponse response = catalogService.deleteKitchenPhoto(principal, kind);
        if (kind == KitchenPhotoKind.CHEF) discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @GetMapping("/settings")
    public KitchenSettings getSettings(@AuthenticationPrincipal CravesPrincipal principal) {
        return catalogService.getKitchenSettings(principal);
    }

    @PutMapping("/settings")
    public KitchenSettings updateSettings(
        @AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody KitchenSettings request
    ) {
        return catalogService.updateKitchenSettings(principal, request);
    }

    @GetMapping("/menu-items")
    public List<MenuItemResponse> listMyMenuItems(@AuthenticationPrincipal CravesPrincipal principal) {
        return catalogService.listMyMenuItems(principal);
    }

    @PostMapping("/menu-items")
    public MenuItemResponse createMenuItem(
        @AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody MenuItemRequest request
    ) {
        MenuItemResponse response = catalogService.createMenuItem(principal, request);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @PutMapping("/menu-items/{menuItemId}")
    public MenuItemResponse updateMenuItem(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID menuItemId,
        @Valid @RequestBody MenuItemRequest request
    ) {
        MenuItemResponse response = catalogService.updateMenuItem(principal, menuItemId, request);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @DeleteMapping("/menu-items/{menuItemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archiveMenuItem(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID menuItemId
    ) {
        catalogService.archiveMenuItem(principal, menuItemId);
        discoveryCacheService.invalidateAllDiscovery();
    }

    @PatchMapping("/menu-items/{menuItemId}/availability")
    public MenuItemResponse updateAvailability(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID menuItemId,
        @Valid @RequestBody AvailabilityRequest request
    ) {
        MenuItemResponse response = catalogService.updateAvailability(principal, menuItemId, request);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @PatchMapping("/menu-items/availability")
    public BulkAvailabilityResponse updateAvailabilityBulk(
        @AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody BulkAvailabilityRequest request
    ) {
        BulkAvailabilityResponse response = bulkMenuAvailabilityService.update(principal, request);
        if (response.changedCount() > 0) {
            discoveryCacheService.invalidateAllDiscovery();
        }
        return response;
    }

    @PostMapping("/menu-items/{menuItemId}/images")
    public MenuItemImageResponse uploadMenuItemImage(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID menuItemId,
        @RequestParam MultipartFile file,
        @RequestParam(defaultValue = "false") boolean primary
    ) {
        MenuItemImageResponse response = catalogService.uploadMenuItemImage(principal, menuItemId, file, primary);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @DeleteMapping("/menu-items/{menuItemId}/images/{imageId}")
    public MenuItemResponse deleteMenuItemImage(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID menuItemId,
        @PathVariable UUID imageId
    ) {
        MenuItemResponse response = catalogService.deleteMenuItemImage(principal, menuItemId, imageId);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @PutMapping("/menu-items/{menuItemId}/images/{imageId}/primary")
    public MenuItemResponse setPrimaryMenuItemImage(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID menuItemId,
        @PathVariable UUID imageId
    ) {
        MenuItemResponse response = catalogService.setPrimaryMenuItemImage(principal, menuItemId, imageId);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }
}
