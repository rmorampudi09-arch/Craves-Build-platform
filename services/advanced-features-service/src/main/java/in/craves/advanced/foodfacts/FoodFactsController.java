package in.craves.advanced.foodfacts;

import in.craves.advanced.foodfacts.FoodFactsDtos.Badge;
import in.craves.advanced.foodfacts.FoodFactsDtos.ChefFactsView;
import in.craves.advanced.foodfacts.FoodFactsDtos.FactsContent;
import in.craves.advanced.foodfacts.FoodFactsDtos.FreeFromPage;
import in.craves.advanced.foodfacts.FoodFactsDtos.LookupRequest;
import in.craves.advanced.foodfacts.FoodFactsDtos.PublicFacts;
import in.craves.advanced.foodfacts.FoodFactsDtos.Source;
import in.craves.advanced.foodfacts.FoodFactsDtos.Vocabulary;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public reads for dish pages and listings, plus the chef's own declaration workflow. */
@RestController
@RequestMapping("/api/v1/food-facts")
public class FoodFactsController {
    private final FoodFactsService service;

    public FoodFactsController(FoodFactsService service) {
        this.service = service;
    }

    @GetMapping("/vocabulary")
    public ResponseEntity<Vocabulary> vocabulary() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .body(new Vocabulary(List.of(Allergen.values()), List.of(Source.values()), FoodFactsService.DISCLAIMER));
    }

    @GetMapping("/menu-items/{menuItemId}")
    public ResponseEntity<PublicFacts> publicFacts(@PathVariable UUID menuItemId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(service.publicFacts(menuItemId));
    }

    @PostMapping("/menu-items/lookup")
    public ResponseEntity<List<Badge>> lookup(@Valid @RequestBody LookupRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.lookup(request.menuItemIds()));
    }

    /** Menu items whose published facts declare none of these allergens (dishes without facts are never included). */
    @GetMapping("/free-from")
    public ResponseEntity<FreeFromPage> freeFrom(@RequestParam("allergens") String allergens,
                                                 @RequestParam(value = "cursor", required = false) String cursor,
                                                 @RequestParam(value = "limit", required = false) Integer limit) {
        Set<Allergen> wanted = EnumSet.noneOf(Allergen.class);
        for (String name : Arrays.stream(allergens.split(",")).map(String::strip).filter(s -> !s.isEmpty()).toList()) {
            try {
                wanted.add(Allergen.valueOf(name.toUpperCase()));
            } catch (IllegalArgumentException ex) {
                throw ApiProblem.badRequest("UNKNOWN_ALLERGEN", "Unknown allergen: " + name);
            }
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.freeFrom(wanted, cursor, Cursor.limit(limit, 50, 200)));
    }

    @GetMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<ChefFactsView> chefView(@PathVariable UUID menuItemId) {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefView(CurrentUser.bearerToken(), menuItemId));
    }

    @PutMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<ChefFactsView> saveDraft(@PathVariable UUID menuItemId, @Valid @RequestBody FactsContent content,
                                                   @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.saveDraft(chef, CurrentUser.bearerToken(), menuItemId, content, version(ifMatch)));
    }

    @PostMapping("/chef/menu-items/{menuItemId}/submit")
    public ResponseEntity<ChefFactsView> submit(@PathVariable UUID menuItemId,
                                                @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.submit(chef, CurrentUser.bearerToken(), menuItemId, version(ifMatch)));
    }

    @DeleteMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<Void> withdraw(@PathVariable UUID menuItemId) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        service.withdraw(chef, CurrentUser.bearerToken(), menuItemId);
        return ResponseEntity.noContent().build();
    }

    static Long version(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) return null;
        try {
            return Long.parseLong(ifMatch.replace("W/", "").replace("\"", "").strip());
        } catch (NumberFormatException ex) {
            throw ApiProblem.badRequest("INVALID_IF_MATCH", "If-Match must carry the facts version");
        }
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
