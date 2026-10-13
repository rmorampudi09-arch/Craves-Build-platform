package in.craves.order.web;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderService;
import in.craves.order.web.ApiDtos.ChargePolicyRequest;
import in.craves.order.web.ApiDtos.ChargePolicyResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/charge-policy")
public class AdminChargePolicyController {
    private final OrderService orderService;

    public AdminChargePolicyController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/current")
    public ChargePolicyResponse current(@AuthenticationPrincipal CravesPrincipal principal) {
        if (principal == null || !principal.hasAnyRole("PLATFORM_ADMIN", "PAYMENTS_ADMIN", "AUDIT_ADMIN")) {
            throw new OrderApiException(HttpStatus.FORBIDDEN, "ROLE_REQUIRED", "PLATFORM_ADMIN, PAYMENTS_ADMIN or AUDIT_ADMIN role is required");
        }
        return orderService.currentChargePolicy();
    }

    @PostMapping
    public ChargePolicyResponse create(@AuthenticationPrincipal CravesPrincipal principal, @Valid @RequestBody ChargePolicyRequest request) {
        return orderService.createChargePolicy(principal, request);
    }
}
