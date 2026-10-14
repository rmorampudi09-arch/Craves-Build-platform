package in.craves.catalog.web;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.InternalCatalogAuthorizer;
import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog/internal")
public class InternalCatalogController {
    private final CatalogService catalogService;
    private final InternalCatalogAuthorizer authorizer;
    private final DiscoveryCacheService discoveryCacheService;

    public InternalCatalogController(CatalogService catalogService, InternalCatalogAuthorizer authorizer, DiscoveryCacheService discoveryCacheService) {
        this.catalogService = catalogService;
        this.authorizer = authorizer;
        this.discoveryCacheService = discoveryCacheService;
    }

    @GetMapping("/kitchens/{kitchenId}")
    public KitchenProfileResponse getKitchen(
        @RequestHeader(value = InternalCatalogAuthorizer.HEADER_NAME, required = false) String internalKey,
        @PathVariable UUID kitchenId
    ) {
        authorizer.requireAuthorized(internalKey);
        return catalogService.getInternalKitchen(kitchenId);
    }

    /** Craves support: empties a kitchen photo slot (1 or 2) so the chef can add a new photo. */
    @DeleteMapping("/kitchens/{kitchenId}/photos/{slot}")
    public ResponseEntity<Void> clearKitchenPhoto(
        @RequestHeader(value = InternalCatalogAuthorizer.HEADER_NAME, required = false) String internalKey,
        @PathVariable UUID kitchenId,
        @PathVariable int slot
    ) {
        authorizer.requireAuthorized(internalKey);
        if (slot != 1 && slot != 2) {
            throw ApiException.badRequest("KITCHEN_PHOTO_SLOT_INVALID", "Kitchen photo slot must be 1 or 2");
        }
        catalogService.clearKitchenPhotoSlot(kitchenId, slot);
        discoveryCacheService.invalidateAllDiscovery();
        return ResponseEntity.noContent().build();
    }
}
