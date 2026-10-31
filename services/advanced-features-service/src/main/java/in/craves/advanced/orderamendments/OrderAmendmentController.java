package in.craves.advanced.orderamendments;

import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentAccept;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentDecline;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentRequest;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentView;
import in.craves.advanced.platform.data.Idempotency;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The customer's and the kitchen chef's side of changes to a placed order: propose, answer, withdraw, list. */
@RestController
@RequestMapping("/api/v1/advanced/order-amendments")
public class OrderAmendmentController {
    private final OrderAmendmentService service;
    private final Idempotency idempotency;

    public OrderAmendmentController(OrderAmendmentService service, Idempotency idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @PostMapping("/orders/{orderId}")
    public ResponseEntity<OrderAmendmentView> proposeOrderAmendment(@PathVariable UUID orderId, @Valid @RequestBody OrderAmendmentRequest request,
                                                                    @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID customer = CurrentUser.id();
        String token = CurrentUser.bearerToken();
        var outcome = idempotency.run("order-amendments.propose", customer, key, List.of(orderId, request), OrderAmendmentView.class,
                () -> service.propose(customer, token, orderId, request));
        return created(outcome.body(), outcome.replayed());
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<List<OrderAmendmentView>> orderAmendmentsForOrder(@PathVariable UUID orderId) {
        return ok(service.forCustomerOrder(CurrentUser.id(), orderId));
    }

    @GetMapping("/mine")
    public ResponseEntity<List<OrderAmendmentView>> myOrderAmendments() {
        return ok(service.mine(CurrentUser.id()));
    }

    @PostMapping("/{amendmentId}/accept")
    public ResponseEntity<OrderAmendmentView> acceptOrderAmendment(@PathVariable UUID amendmentId, @Valid @RequestBody OrderAmendmentAccept request) {
        return ok(service.accept(CurrentUser.id(), CurrentUser.bearerToken(), amendmentId, request.expectedVersion()));
    }

    @PostMapping("/{amendmentId}/decline")
    public ResponseEntity<OrderAmendmentView> declineOrderAmendment(@PathVariable UUID amendmentId, @Valid @RequestBody OrderAmendmentDecline request) {
        return ok(service.decline(CurrentUser.id(), amendmentId, request.reason()));
    }

    @PostMapping("/{amendmentId}/withdraw")
    public ResponseEntity<OrderAmendmentView> withdrawOrderAmendment(@PathVariable UUID amendmentId) {
        return ok(service.withdraw(CurrentUser.id(), amendmentId));
    }

    @PostMapping("/chef/orders/{orderId}")
    public ResponseEntity<OrderAmendmentView> proposeChefOrderAmendment(@PathVariable UUID orderId, @Valid @RequestBody OrderAmendmentRequest request,
                                                                        @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        String token = CurrentUser.bearerToken();
        var outcome = idempotency.run("order-amendments.chef-propose", chef, key, List.of(orderId, request), OrderAmendmentView.class,
                () -> service.chefPropose(chef, token, orderId, request));
        return created(outcome.body(), outcome.replayed());
    }

    @GetMapping("/chef/orders/{orderId}")
    public ResponseEntity<List<OrderAmendmentView>> chefOrderAmendmentsForOrder(@PathVariable UUID orderId) {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.forChefOrder(CurrentUser.bearerToken(), orderId));
    }

    @GetMapping("/chef/pending")
    public ResponseEntity<List<OrderAmendmentView>> chefPendingOrderAmendments() {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefPending(CurrentUser.bearerToken()));
    }

    @PostMapping("/chef/{amendmentId}/accept")
    public ResponseEntity<OrderAmendmentView> chefAcceptOrderAmendment(@PathVariable UUID amendmentId, @Valid @RequestBody OrderAmendmentAccept request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefAccept(chef, CurrentUser.bearerToken(), amendmentId, request.expectedVersion()));
    }

    @PostMapping("/chef/{amendmentId}/decline")
    public ResponseEntity<OrderAmendmentView> chefDeclineOrderAmendment(@PathVariable UUID amendmentId,
                                                                        @Valid @RequestBody OrderAmendmentDecline request) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefDecline(chef, CurrentUser.bearerToken(), amendmentId, request.reason()));
    }

    @PostMapping("/chef/{amendmentId}/withdraw")
    public ResponseEntity<OrderAmendmentView> chefWithdrawOrderAmendment(@PathVariable UUID amendmentId) {
        UUID chef = CurrentUser.requireAnyRole(Roles.CHEF);
        return ok(service.chefWithdraw(chef, amendmentId));
    }

    static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private static ResponseEntity<OrderAmendmentView> created(OrderAmendmentView body, boolean replayed) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).header("Idempotent-Replayed", String.valueOf(replayed))
                .body(body);
    }
}
