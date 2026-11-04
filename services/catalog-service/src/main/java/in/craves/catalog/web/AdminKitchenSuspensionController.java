package in.craves.catalog.web;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.service.KitchenSuspensionService;
import in.craves.catalog.service.KitchenSuspensionService.Suspension;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Handbook 008: staff suspend and reinstate a kitchen. 404 unless CRAVES_KITCHEN_SUSPENSION_ENABLED=true. */
@RestController
@RequestMapping("/api/v1/catalog/admin/kitchens/{kitchenId}/suspension")
public class AdminKitchenSuspensionController {
    public record KitchenSuspensionRequest(String reason) {}

    private final KitchenSuspensionService service;
    private final DiscoveryCacheService discoveryCache;
    private final boolean enabled;

    public AdminKitchenSuspensionController(KitchenSuspensionService service, DiscoveryCacheService discoveryCache,
        @Value("${CRAVES_KITCHEN_SUSPENSION_ENABLED:false}") boolean enabled) {
        this.service = service;
        this.discoveryCache = discoveryCache;
        this.enabled = enabled;
    }

    @GetMapping
    public ResponseEntity<Suspension> getKitchenSuspension(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID kitchenId) {
        requireEnabled();
        return noStore(service.get(principal, kitchenId));
    }

    @PostMapping
    public ResponseEntity<Suspension> suspendKitchen(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID kitchenId,
        @RequestBody KitchenSuspensionRequest request) {
        requireEnabled();
        Suspension result = service.suspend(principal, kitchenId, request == null ? null : request.reason());
        discoveryCache.invalidateAllDiscovery();
        return noStore(result);
    }

    @PostMapping("/lift")
    public ResponseEntity<Suspension> reinstateKitchen(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID kitchenId,
        @RequestBody KitchenSuspensionRequest request) {
        requireEnabled();
        Suspension result = service.reinstate(principal, kitchenId, request == null ? null : request.reason());
        discoveryCache.invalidateAllDiscovery();
        return noStore(result);
    }

    private void requireEnabled() {
        if (!enabled) throw ApiException.notFound("NOT_FOUND", "Not found");
    }

    private static ResponseEntity<Suspension> noStore(Suspension body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }
}
