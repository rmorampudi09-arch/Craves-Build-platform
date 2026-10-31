package in.craves.advanced.tastememory;

import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDish;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDishLookup;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDishPage;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDishRequest;
import in.craves.advanced.tastememory.TasteMemoryDtos.TasteProfile;
import in.craves.advanced.tastememory.TasteMemoryDtos.TasteProfileRequest;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in person's own remembered spice, oil and option choices; nobody else can read them. */
@RestController
@RequestMapping("/api/v1/advanced/taste-memory")
public class TasteMemoryController {
    private final TasteMemoryService service;

    public TasteMemoryController(TasteMemoryService service) {
        this.service = service;
    }

    @GetMapping("/profile")
    public ResponseEntity<TasteProfile> tasteProfile() {
        return ok(service.profile(CurrentUser.id()));
    }

    @PutMapping("/profile")
    public ResponseEntity<TasteProfile> setTasteProfile(@Valid @RequestBody TasteProfileRequest request) {
        return ok(service.saveProfile(CurrentUser.id(), request));
    }

    @GetMapping("/menu-items")
    public ResponseEntity<RememberedDishPage> rememberedDishes(@RequestParam(value = "cursor", required = false) String cursor,
                                                               @RequestParam(value = "limit", required = false) Integer limit) {
        return ok(service.recent(CurrentUser.id(), cursor, Cursor.limit(limit, 50, 200)));
    }

    @PostMapping("/menu-items/lookup")
    public ResponseEntity<List<RememberedDish>> lookupRememberedDishes(@Valid @RequestBody RememberedDishLookup request) {
        return ok(service.lookup(CurrentUser.id(), request.menuItemIds()));
    }

    @PutMapping("/menu-items/{menuItemId}")
    public ResponseEntity<RememberedDish> rememberDish(@PathVariable UUID menuItemId, @Valid @RequestBody RememberedDishRequest request) {
        return ok(service.rememberDish(CurrentUser.id(), menuItemId, request));
    }

    @DeleteMapping("/menu-items/{menuItemId}")
    public ResponseEntity<Void> forgetDish(@PathVariable UUID menuItemId) {
        service.forgetDish(CurrentUser.id(), menuItemId);
        return ResponseEntity.noContent().build();
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
