package in.craves.advanced.menuoptions;

import in.craves.advanced.menuoptions.MenuOptionsDtos.DishOptions;
import in.craves.advanced.menuoptions.MenuOptionsDtos.DishOptionsLookup;
import in.craves.advanced.menuoptions.MenuOptionsDtos.DishOptionsRequest;
import in.craves.advanced.menuoptions.MenuOptionsDtos.KitchenMealPeriods;
import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriodsRequest;
import in.craves.advanced.menuoptions.MenuOptionsDtos.PriceQuote;
import in.craves.advanced.menuoptions.MenuOptionsDtos.PriceQuoteRequest;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public options and meal hours for menus, a signed-in price quote, and the chef's own options and hours. */
@RestController
@RequestMapping("/api/v1/advanced/menu-options")
public class MenuOptionsController {
    private static final CacheControl SHORT_PUBLIC = CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic();
    private final MenuOptionsService service;

    public MenuOptionsController(MenuOptionsService service) {
        this.service = service;
    }

    @GetMapping("/menu-items/{menuItemId}")
    public ResponseEntity<DishOptions> dishOptions(@PathVariable UUID menuItemId) {
        return ResponseEntity.ok().cacheControl(SHORT_PUBLIC).body(service.dishOptions(menuItemId));
    }

    @PostMapping("/menu-items/lookup")
    public ResponseEntity<List<DishOptions>> lookupDishOptions(@Valid @RequestBody DishOptionsLookup request) {
        return ok(service.lookup(request.menuItemIds()));
    }

    /** The kitchen's meal hours (India time) and the meals it is serving right now. */
    @GetMapping("/kitchens/{kitchenId}/meal-periods")
    public ResponseEntity<KitchenMealPeriods> kitchenMealPeriods(@PathVariable UUID kitchenId) {
        return ResponseEntity.ok().cacheControl(SHORT_PUBLIC).body(service.kitchenMealPeriods(kitchenId));
    }

    /** Signed-in: price of a dish with the chosen options (Catalog's live price plus the chef's option prices). */
    @PostMapping("/quote")
    public ResponseEntity<PriceQuote> quoteDishPrice(@Valid @RequestBody PriceQuoteRequest request) {
        return ok(service.quote(request));
    }

    @GetMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<DishOptions> chefDishOptions(@PathVariable UUID menuItemId) {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefDishOptions(CurrentUser.bearerToken(), menuItemId));
    }

    @PutMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<DishOptions> setDishOptions(@PathVariable UUID menuItemId, @Valid @RequestBody DishOptionsRequest request,
                                                      @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.setDishOptions(chef, CurrentUser.bearerToken(), menuItemId, request, version(ifMatch)));
    }

    @DeleteMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<Void> clearDishOptions(@PathVariable UUID menuItemId) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        service.clearDishOptions(chef, CurrentUser.bearerToken(), menuItemId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/chef/meal-periods")
    public ResponseEntity<KitchenMealPeriods> chefMealPeriods() {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefMealPeriods(CurrentUser.bearerToken()));
    }

    @PutMapping("/chef/meal-periods")
    public ResponseEntity<KitchenMealPeriods> setMealPeriods(@Valid @RequestBody MealPeriodsRequest request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.setMealPeriods(chef, CurrentUser.bearerToken(), request));
    }

    static Long version(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) return null;
        try {
            return Long.parseLong(ifMatch.replace("W/", "").replace("\"", "").strip());
        } catch (NumberFormatException ex) {
            throw ApiProblem.badRequest("INVALID_IF_MATCH", "If-Match must carry the options version");
        }
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
