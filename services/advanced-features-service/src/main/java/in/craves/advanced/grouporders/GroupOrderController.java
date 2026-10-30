package in.craves.advanced.grouporders;

import in.craves.advanced.grouporders.GroupOrderDtos.Checkout;
import in.craves.advanced.grouporders.GroupOrderDtos.CheckoutResult;
import in.craves.advanced.grouporders.GroupOrderDtos.CreateGroupOrder;
import in.craves.advanced.grouporders.GroupOrderDtos.GroupOrderSummary;
import in.craves.advanced.grouporders.GroupOrderDtos.GroupOrderView;
import in.craves.advanced.grouporders.GroupOrderDtos.JoinGroupOrder;
import in.craves.advanced.grouporders.GroupOrderDtos.PutMyItem;
import in.craves.advanced.grouporders.GroupOrderDtos.Unlock;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/advanced/group-orders")
public class GroupOrderController {
    private final GroupOrderService service;
    private final Idempotency idempotency;

    public GroupOrderController(GroupOrderService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @PostMapping
    public ResponseEntity<GroupOrderView> create(@Valid @RequestBody CreateGroupOrder request,
                                                 @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID host = CurrentUser.requireAnyRole(Roles.CUSTOMER);
        var outcome = idempotency.run("group-orders.create", host, key, request, GroupOrderView.class, () -> service.create(host, request));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Idempotent-Replayed", String.valueOf(outcome.replayed())).body(outcome.body());
    }

    @PostMapping("/join")
    public ResponseEntity<GroupOrderView> join(@Valid @RequestBody JoinGroupOrder request) {
        UUID person = CurrentUser.requireAnyRole(Roles.CUSTOMER);
        return ok(service.join(person, request.code(), request.displayName()));
    }

    @GetMapping
    public ResponseEntity<List<GroupOrderSummary>> mine() {
        return ok(service.mine(CurrentUser.id()));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<GroupOrderView> get(@PathVariable UUID groupId) {
        return ok(service.get(CurrentUser.id(), groupId));
    }

    @PutMapping("/{groupId}/my-items/{menuItemId}")
    public ResponseEntity<GroupOrderView> putMyItem(@PathVariable UUID groupId, @PathVariable UUID menuItemId,
                                                    @Valid @RequestBody PutMyItem request) {
        return ok(service.putMyItem(CurrentUser.id(), groupId, menuItemId, request.quantity(), request.note()));
    }

    @DeleteMapping("/{groupId}/my-items/{menuItemId}")
    public ResponseEntity<GroupOrderView> removeMyItem(@PathVariable UUID groupId, @PathVariable UUID menuItemId) {
        return ok(service.removeMyItem(CurrentUser.id(), groupId, menuItemId));
    }

    @PostMapping("/{groupId}/leave")
    public ResponseEntity<Void> leave(@PathVariable UUID groupId) {
        service.leave(CurrentUser.id(), groupId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{groupId}/participants/{participantId}")
    public ResponseEntity<GroupOrderView> removeParticipant(@PathVariable UUID groupId, @PathVariable UUID participantId,
                                                            @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return ok(service.removeParticipant(CurrentUser.id(), groupId, participantId, version(ifMatch)));
    }

    @PostMapping("/{groupId}/lock")
    public ResponseEntity<GroupOrderView> lock(@PathVariable UUID groupId, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return ok(service.lock(CurrentUser.id(), groupId, version(ifMatch)));
    }

    @PostMapping("/{groupId}/unlock")
    public ResponseEntity<GroupOrderView> unlock(@PathVariable UUID groupId, @Valid @RequestBody(required = false) Unlock request,
                                                 @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return ok(service.unlock(CurrentUser.id(), groupId, request == null ? null : request.joinWindowMinutes(), version(ifMatch)));
    }

    @PostMapping("/{groupId}/cancel")
    public ResponseEntity<GroupOrderView> cancel(@PathVariable UUID groupId, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return ok(service.cancel(CurrentUser.id(), groupId, version(ifMatch)));
    }

    @PostMapping("/{groupId}/checkout")
    public ResponseEntity<CheckoutResult> checkout(@PathVariable UUID groupId, @Valid @RequestBody(required = false) Checkout request,
                                                   @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        UUID host = CurrentUser.id();
        boolean apply = request != null && request.applyToCart();
        boolean replace = request != null && request.replaceCart();
        return ok(service.checkout(host, CurrentUser.bearerToken(), groupId, apply, replace, version(ifMatch)));
    }

    private static Long version(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) return null;
        try {
            return Long.parseLong(ifMatch.replace("W/", "").replace("\"", "").strip());
        } catch (NumberFormatException ex) {
            throw ApiProblem.badRequest("INVALID_IF_MATCH", "If-Match must carry the group order version");
        }
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
