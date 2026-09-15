package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.CustomerHomeFavoriteService;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.CursorPage;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteChefResponse;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteEntityType;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteKitchenResponse;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteWatchChannel;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteWatchResponse;
import in.craves.userchef.web.CustomerHomeFavoriteDtos.FavoriteWatchUpsertRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customer")
public class CustomerHomeFavoriteController {
    private final CustomerHomeFavoriteService service;

    public CustomerHomeFavoriteController(CustomerHomeFavoriteService service) {
        this.service = service;
    }

    @GetMapping("/favorite-chefs")
    public CursorPage<FavoriteChefResponse> listFavoriteChefs(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return service.listFavoriteChefs(user, limit, cursor);
    }

    @PutMapping("/favorite-chefs/{chefIdentityId}")
    public FavoriteChefResponse saveFavoriteChef(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID chefIdentityId
    ) {
        return service.saveFavoriteChef(user, chefIdentityId);
    }

    @DeleteMapping("/favorite-chefs/{chefIdentityId}")
    public ResponseEntity<Void> removeFavoriteChef(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID chefIdentityId
    ) {
        service.removeFavoriteChef(user, chefIdentityId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/favorite-kitchens")
    public CursorPage<FavoriteKitchenResponse> listFavoriteKitchens(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return service.listFavoriteKitchens(user, limit, cursor);
    }

    @PutMapping("/favorite-kitchens/{kitchenId}")
    public FavoriteKitchenResponse saveFavoriteKitchen(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID kitchenId
    ) {
        return service.saveFavoriteKitchen(user, kitchenId);
    }

    @DeleteMapping("/favorite-kitchens/{kitchenId}")
    public ResponseEntity<Void> removeFavoriteKitchen(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable UUID kitchenId
    ) {
        service.removeFavoriteKitchen(user, kitchenId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/favorite-watches")
    public List<FavoriteWatchResponse> listWatches(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam FavoriteEntityType entityType,
        @RequestParam(required = false) Integer limit
    ) {
        return service.listWatches(user, entityType, limit);
    }

    @PutMapping("/favorite-watches/{entityType}/{entityId}")
    public FavoriteWatchResponse upsertWatch(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable FavoriteEntityType entityType,
        @PathVariable UUID entityId,
        @Valid @RequestBody FavoriteWatchUpsertRequest request
    ) {
        return service.upsertWatch(
            user,
            entityType,
            entityId,
            request.channel(),
            request.effectiveEnabled()
        );
    }

    @DeleteMapping("/favorite-watches/{entityType}/{entityId}")
    public ResponseEntity<Void> removeWatch(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable FavoriteEntityType entityType,
        @PathVariable UUID entityId,
        @RequestParam FavoriteWatchChannel channel
    ) {
        service.removeWatch(user, entityType, entityId, channel);
        return ResponseEntity.noContent().build();
    }
}
