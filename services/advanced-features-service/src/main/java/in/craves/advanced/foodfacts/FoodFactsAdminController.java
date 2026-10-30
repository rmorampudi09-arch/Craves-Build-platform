package in.craves.advanced.foodfacts;

import in.craves.advanced.foodfacts.FoodFactsDtos.ChefFactsView;
import in.craves.advanced.foodfacts.FoodFactsDtos.QueuePage;
import in.craves.advanced.foodfacts.FoodFactsDtos.Review;
import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Staff review of chef declarations. */
@RestController
@RequestMapping("/api/v1/advanced/food-facts/admin")
public class FoodFactsAdminController {
    private static final String[] REVIEWERS = {Roles.PLATFORM_ADMIN, Roles.CHEF_ADMIN, Roles.COMPLIANCE_ADMIN};
    private final FoodFactsService service;

    public FoodFactsAdminController(FoodFactsService service) {
        this.service = service;
    }

    @GetMapping("/queue")
    public ResponseEntity<QueuePage> queue(@RequestParam(value = "cursor", required = false) String cursor,
                                           @RequestParam(value = "limit", required = false) Integer limit) {
        CurrentUser.requireAnyRole(REVIEWERS);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.queue(cursor, Cursor.limit(limit, 25, 100)));
    }

    @PostMapping("/menu-items/{menuItemId}/verify")
    public ResponseEntity<ChefFactsView> verify(@PathVariable UUID menuItemId, @Valid @RequestBody Review review) {
        UUID reviewer = CurrentUser.requireAnyRole(REVIEWERS);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.review(reviewer, menuItemId, true, review.expectedVersion(), review.note()));
    }

    @PostMapping("/menu-items/{menuItemId}/reject")
    public ResponseEntity<ChefFactsView> reject(@PathVariable UUID menuItemId, @Valid @RequestBody Review review) {
        UUID reviewer = CurrentUser.requireAnyRole(REVIEWERS);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.review(reviewer, menuItemId, false, review.expectedVersion(), review.note()));
    }
}
