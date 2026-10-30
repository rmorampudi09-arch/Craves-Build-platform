package in.craves.advanced.foodlists;

import in.craves.advanced.foodlists.FoodListDtos.CreateFoodList;
import in.craves.advanced.foodlists.FoodListDtos.CreateShare;
import in.craves.advanced.foodlists.FoodListDtos.FoodListDetail;
import in.craves.advanced.foodlists.FoodListDtos.FoodListSummary;
import in.craves.advanced.foodlists.FoodListDtos.PutItem;
import in.craves.advanced.foodlists.FoodListDtos.Reorder;
import in.craves.advanced.foodlists.FoodListDtos.ShareLink;
import in.craves.advanced.foodlists.FoodListDtos.UpdateFoodList;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A signed-in person's own food lists. Every list is private until its owner creates a share link. */
@RestController
@RequestMapping("/api/v1/food-lists")
public class FoodListController {
    private final FoodListService service;
    private final Idempotency idempotency;

    public FoodListController(FoodListService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @GetMapping
    public ResponseEntity<List<FoodListSummary>> myLists() {
        return ok(service.myLists(CurrentUser.id()));
    }

    @PostMapping
    public ResponseEntity<FoodListDetail> create(@Valid @RequestBody CreateFoodList request,
                                                 @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID owner = CurrentUser.id();
        var outcome = idempotency.run("food-lists.create", owner, key, request, FoodListDetail.class, () -> service.create(owner, request));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @GetMapping("/{listId}")
    public ResponseEntity<FoodListDetail> get(@PathVariable UUID listId) {
        return ok(service.get(CurrentUser.id(), listId));
    }

    @PatchMapping("/{listId}")
    public ResponseEntity<FoodListDetail> update(@PathVariable UUID listId, @Valid @RequestBody UpdateFoodList request,
                                                 @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return ok(service.update(CurrentUser.id(), listId, request, version(ifMatch)));
    }

    @DeleteMapping("/{listId}")
    public ResponseEntity<Void> delete(@PathVariable UUID listId) {
        service.delete(CurrentUser.id(), listId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{listId}/items/{menuItemId}")
    public ResponseEntity<FoodListDetail> putItem(@PathVariable UUID listId, @PathVariable UUID menuItemId,
                                                  @Valid @RequestBody(required = false) PutItem request) {
        return ok(service.putItem(CurrentUser.id(), listId, menuItemId, request == null ? null : request.note()));
    }

    @DeleteMapping("/{listId}/items/{menuItemId}")
    public ResponseEntity<FoodListDetail> removeItem(@PathVariable UUID listId, @PathVariable UUID menuItemId) {
        return ok(service.removeItem(CurrentUser.id(), listId, menuItemId));
    }

    @PutMapping("/{listId}/items-order")
    public ResponseEntity<FoodListDetail> reorder(@PathVariable UUID listId, @Valid @RequestBody Reorder request,
                                                  @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return ok(service.reorder(CurrentUser.id(), listId, request.menuItemIds(), version(ifMatch)));
    }

    @PostMapping("/{listId}/share")
    public ResponseEntity<ShareLink> share(@PathVariable UUID listId, @Valid @RequestBody(required = false) CreateShare request) {
        ShareLink link = service.share(CurrentUser.id(), listId, request == null ? null : request.expiresInDays());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(link);
    }

    @DeleteMapping("/{listId}/share")
    public ResponseEntity<Void> revokeShare(@PathVariable UUID listId) {
        service.revokeShare(CurrentUser.id(), listId);
        return ResponseEntity.noContent().build();
    }

    static Long version(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) return null;
        try {
            return Long.parseLong(ifMatch.replace("W/", "").replace("\"", "").strip());
        } catch (NumberFormatException ex) {
            throw ApiProblem.badRequest("INVALID_IF_MATCH", "If-Match must carry the list version");
        }
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
