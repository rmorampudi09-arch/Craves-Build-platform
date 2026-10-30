package in.craves.advanced.foodlists;

import in.craves.advanced.foodlists.FoodListDtos.FoodListDetail;
import in.craves.advanced.foodlists.FoodListDtos.SharedFoodList;
import in.craves.advanced.platform.security.CurrentUser;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read a shared list by its link (no sign-in), or copy it into your own lists (sign-in). */
@RestController
@RequestMapping("/api/v1/shared-food-lists")
public class SharedFoodListController {
    private final FoodListService service;

    public SharedFoodListController(FoodListService service) {
        this.service = service;
    }

    @GetMapping("/{token}")
    public ResponseEntity<SharedFoodList> view(@PathVariable String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Robots-Tag", "noindex")
                .header("Referrer-Policy", "no-referrer").body(service.viewShared(token));
    }

    @PostMapping("/{token}/copy")
    public ResponseEntity<FoodListDetail> copy(@PathVariable String token) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(service.copyShared(CurrentUser.id(), token));
    }
}
