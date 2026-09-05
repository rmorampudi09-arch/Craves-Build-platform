package in.craves.catalog.web;

import in.craves.catalog.security.InternalCatalogAuthorizer;
import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.PublicMenuBatchResolveService;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolveMenuItemsRequest;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolvedMenuItemResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog/internal")
public class InternalCatalogController {
    private final CatalogService catalogService;
    private final PublicMenuBatchResolveService publicMenuBatchResolveService;
    private final InternalCatalogAuthorizer authorizer;

    public InternalCatalogController(
        CatalogService catalogService,
        PublicMenuBatchResolveService publicMenuBatchResolveService,
        InternalCatalogAuthorizer authorizer
    ) {
        this.catalogService = catalogService;
        this.publicMenuBatchResolveService = publicMenuBatchResolveService;
        this.authorizer = authorizer;
    }

    @GetMapping("/kitchens/{kitchenId}")
    public KitchenProfileResponse getKitchen(
        @RequestHeader(value = InternalCatalogAuthorizer.HEADER_NAME, required = false) String internalKey,
        @PathVariable UUID kitchenId
    ) {
        authorizer.requireAuthorized(internalKey);
        return catalogService.getPublicKitchen(kitchenId);
    }

    @PostMapping("/menu-items/resolve")
    public List<ResolvedMenuItemResponse> resolveMenuItems(
        @RequestHeader(value = InternalCatalogAuthorizer.HEADER_NAME, required = false) String internalKey,
        @Valid @RequestBody ResolveMenuItemsRequest request
    ) {
        authorizer.requireAuthorized(internalKey);
        return publicMenuBatchResolveService.resolve(request);
    }
}
