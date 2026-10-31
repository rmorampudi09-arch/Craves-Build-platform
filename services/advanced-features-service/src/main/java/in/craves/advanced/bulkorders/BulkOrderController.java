package in.craves.advanced.bulkorders;

import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderAccept;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderDecline;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderPolicy;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderPolicyView;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderView;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkQuote;
import in.craves.advanced.bulkorders.BulkOrderDtos.NewBulkOrder;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The public rules, the customer's requests and acceptance, the chef's quotes, and the staff-set rules. */
@RestController
@RequestMapping("/api/v1/advanced/bulk-orders")
public class BulkOrderController {
    private static final String[] POLICY_EDITORS = {Roles.PLATFORM_ADMIN, Roles.PAYMENTS_ADMIN};
    private final BulkOrderService service;
    private final Idempotency idempotency;

    public BulkOrderController(BulkOrderService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @GetMapping("/policy")
    public ResponseEntity<BulkOrderPolicyView> bulkOrderPolicy() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(service.policy());
    }

    @PutMapping("/admin/policy")
    public ResponseEntity<BulkOrderPolicyView> setBulkOrderPolicy(@Valid @RequestBody BulkOrderPolicy request) {
        UUID staff = CurrentUser.requireAnyRole(POLICY_EDITORS);
        return ok(service.setPolicy(staff, request));
    }

    @PostMapping
    public ResponseEntity<BulkOrderView> createBulkOrder(@Valid @RequestBody NewBulkOrder request,
                                                         @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID customer = CurrentUser.id();
        var outcome = idempotency.run("bulk-orders.create", customer, key, request, BulkOrderView.class, () -> service.create(customer, request));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @GetMapping("/mine")
    public ResponseEntity<List<BulkOrderView>> myBulkOrders() {
        return ok(service.mine(CurrentUser.id()));
    }

    @GetMapping("/{bulkOrderId}")
    public ResponseEntity<BulkOrderView> bulkOrder(@PathVariable UUID bulkOrderId) {
        return ok(service.get(CurrentUser.id(), bulkOrderId));
    }

    @PostMapping("/{bulkOrderId}/accept")
    public ResponseEntity<BulkOrderView> acceptBulkQuote(@PathVariable UUID bulkOrderId, @Valid @RequestBody BulkOrderAccept request) {
        return ok(service.accept(CurrentUser.id(), bulkOrderId, request.expectedVersion()));
    }

    @PostMapping("/{bulkOrderId}/cancel")
    public ResponseEntity<BulkOrderView> cancelBulkOrder(@PathVariable UUID bulkOrderId) {
        return ok(service.cancel(CurrentUser.id(), bulkOrderId));
    }

    @GetMapping("/chef/requests")
    public ResponseEntity<List<BulkOrderView>> chefBulkOrders() {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefRequests(CurrentUser.bearerToken()));
    }

    @PostMapping("/chef/requests/{bulkOrderId}/quote")
    public ResponseEntity<BulkOrderView> quoteBulkOrder(@PathVariable UUID bulkOrderId, @Valid @RequestBody BulkQuote request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.quote(chef, CurrentUser.bearerToken(), bulkOrderId, request));
    }

    @PostMapping("/chef/requests/{bulkOrderId}/decline")
    public ResponseEntity<BulkOrderView> declineBulkOrder(@PathVariable UUID bulkOrderId, @Valid @RequestBody BulkOrderDecline request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.decline(chef, CurrentUser.bearerToken(), bulkOrderId, request.reason()));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
