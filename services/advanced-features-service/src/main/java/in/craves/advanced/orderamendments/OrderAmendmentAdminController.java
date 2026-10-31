package in.craves.advanced.orderamendments;

import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentView;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Staff read every change proposed on an order, for support cases and disputes. */
@RestController
@RequestMapping("/api/v1/advanced/order-amendments/admin")
public class OrderAmendmentAdminController {
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.SUPPORT_ADMIN, Roles.OPERATIONS_ADMIN, Roles.AUDIT_ADMIN};
    private final OrderAmendmentService service;

    public OrderAmendmentAdminController(OrderAmendmentService service) {
        this.service = service;
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<List<OrderAmendmentView>> staffOrderAmendments(@PathVariable UUID orderId) {
        CurrentUser.requireAnyRole(READERS);
        return OrderAmendmentController.ok(service.forStaff(orderId));
    }
}
