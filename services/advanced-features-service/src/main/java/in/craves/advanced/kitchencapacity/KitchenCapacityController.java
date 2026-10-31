package in.craves.advanced.kitchencapacity;

import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.BatchAvailability;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.BatchChange;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.ChefBatch;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.HoldConfirmation;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.HoldVoid;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.KitchenLoad;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.KitchenLoadRequest;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.NewBatch;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.NewHold;
import in.craves.advanced.kitchencapacity.KitchenCapacityDtos.PortionHold;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import jakarta.validation.Valid;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
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

/** Public batch availability and kitchen load, the signed-in person's portion holds, and the chef's batches and load. */
@RestController
@RequestMapping("/api/v1/advanced/kitchen-capacity")
public class KitchenCapacityController {
    private final KitchenCapacityService service;
    private final Idempotency idempotency;

    public KitchenCapacityController(KitchenCapacityService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    /** date: India date (YYYY-MM-DD), today when omitted. */
    @GetMapping("/menu-items/{menuItemId}/batches")
    public ResponseEntity<List<BatchAvailability>> dishBatches(@PathVariable UUID menuItemId,
                                                               @RequestParam(value = "date", required = false)
                                                               @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ok(service.dishBatches(menuItemId, date));
    }

    @GetMapping("/kitchens/{kitchenId}/load")
    public ResponseEntity<KitchenLoad> kitchenLoad(@PathVariable UUID kitchenId) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(service.kitchenLoad(kitchenId));
    }

    @PostMapping("/batches/{batchId}/holds")
    public ResponseEntity<PortionHold> holdPortions(@PathVariable UUID batchId, @Valid @RequestBody NewHold request,
                                                    @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID person = CurrentUser.id();
        var outcome = idempotency.run("kitchen-capacity.hold", person, key, List.of(batchId, request), PortionHold.class,
                () -> service.hold(person, batchId, request.portions()));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @PostMapping("/holds/{holdId}/confirm")
    public ResponseEntity<PortionHold> confirmHold(@PathVariable UUID holdId, @Valid @RequestBody HoldConfirmation request) {
        return ok(service.confirm(CurrentUser.id(), holdId, request.orderId()));
    }

    @DeleteMapping("/holds/{holdId}")
    public ResponseEntity<Void> releaseHold(@PathVariable UUID holdId) {
        service.release(CurrentUser.id(), holdId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/chef/batches")
    public ResponseEntity<List<ChefBatch>> chefBatches(@RequestParam(value = "date", required = false)
                                                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefBatches(CurrentUser.bearerToken(), date));
    }

    @PostMapping("/chef/batches")
    public ResponseEntity<ChefBatch> createBatch(@Valid @RequestBody NewBatch request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(service.createBatch(chef, CurrentUser.bearerToken(), request));
    }

    @PutMapping("/chef/batches/{batchId}")
    public ResponseEntity<ChefBatch> updateBatch(@PathVariable UUID batchId, @Valid @RequestBody BatchChange change) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.updateBatch(chef, CurrentUser.bearerToken(), batchId, change));
    }

    @GetMapping("/chef/batches/{batchId}/holds")
    public ResponseEntity<List<PortionHold>> chefBatchHolds(@PathVariable UUID batchId) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefHolds(chef, CurrentUser.bearerToken(), batchId));
    }

    @PostMapping("/chef/holds/{holdId}/void")
    public ResponseEntity<PortionHold> voidHold(@PathVariable UUID holdId, @Valid @RequestBody HoldVoid request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.voidHold(chef, CurrentUser.bearerToken(), holdId, request.reason()));
    }

    @PutMapping("/chef/load")
    public ResponseEntity<KitchenLoad> setKitchenLoad(@Valid @RequestBody KitchenLoadRequest request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.setKitchenLoad(chef, CurrentUser.bearerToken(), request));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
