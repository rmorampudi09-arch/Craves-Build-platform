package in.craves.advanced.taxonomy;

import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.taxonomy.TaxonomyDtos.ChefTagsView;
import in.craves.advanced.taxonomy.TaxonomyDtos.DishBrowsePage;
import in.craves.advanced.taxonomy.TaxonomyDtos.DishTags;
import in.craves.advanced.taxonomy.TaxonomyDtos.DishTagsLookup;
import in.craves.advanced.taxonomy.TaxonomyDtos.LabelResolution;
import in.craves.advanced.taxonomy.TaxonomyDtos.TagRequest;
import in.craves.advanced.taxonomy.TaxonomyDtos.TaxonomyVocabulary;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public vocabulary, resolve and browse for the apps, plus the chef's own labels on their dishes. */
@RestController
@RequestMapping("/api/v1/advanced/taxonomy")
public class TaxonomyController {
    private static final CacheControl VOCABULARY_CACHE = CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic();
    private final TaxonomyService service;

    public TaxonomyController(TaxonomyService service) {
        this.service = service;
    }

    @GetMapping("/vocabulary")
    public ResponseEntity<TaxonomyVocabulary> taxonomyVocabulary() {
        return ResponseEntity.ok().cacheControl(VOCABULARY_CACHE).body(service.vocabulary());
    }

    /** {@code labels} is a comma-separated list of free-text cuisine or diet words, up to 20. */
    @GetMapping("/resolve")
    public ResponseEntity<List<LabelResolution>> resolveLabels(@RequestParam("labels") List<String> labels) {
        return ResponseEntity.ok().cacheControl(VOCABULARY_CACHE).body(service.resolve(labels));
    }

    /** Dishes labelled with {@code cuisine} (or a cuisine below it) and with every diet in {@code diets}; dishes without labels never match. */
    @GetMapping("/menu-items")
    public ResponseEntity<DishBrowsePage> browseDishTags(@RequestParam(value = "cuisine", required = false) String cuisine,
                                             @RequestParam(value = "diets", required = false) List<String> diets,
                                             @RequestParam(value = "cursor", required = false) String cursor,
                                             @RequestParam(value = "limit", required = false) Integer limit) {
        return ok(service.browse(cuisine, diets, cursor, Cursor.limit(limit, 50, 200)));
    }

    @GetMapping("/menu-items/{menuItemId}")
    public ResponseEntity<DishTags> dishTags(@PathVariable UUID menuItemId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(service.dishTags(menuItemId));
    }

    @PostMapping("/menu-items/lookup")
    public ResponseEntity<List<DishTags>> lookupDishTags(@Valid @RequestBody DishTagsLookup request) {
        return ok(service.lookup(request.menuItemIds()));
    }

    @GetMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<ChefTagsView> chefDishTags(@PathVariable UUID menuItemId) {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefView(CurrentUser.bearerToken(), menuItemId));
    }

    @PutMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<ChefTagsView> setDishTags(@PathVariable UUID menuItemId, @Valid @RequestBody TagRequest request,
                                                @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.setTags(chef, CurrentUser.bearerToken(), menuItemId, request, version(ifMatch)));
    }

    @DeleteMapping("/chef/menu-items/{menuItemId}")
    public ResponseEntity<Void> clearDishTags(@PathVariable UUID menuItemId) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        service.clearTags(chef, CurrentUser.bearerToken(), menuItemId);
        return ResponseEntity.noContent().build();
    }

    static Long version(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) return null;
        try {
            return Long.parseLong(ifMatch.replace("W/", "").replace("\"", "").strip());
        } catch (NumberFormatException ex) {
            throw ApiProblem.badRequest("INVALID_IF_MATCH", "If-Match must carry the labels version");
        }
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
