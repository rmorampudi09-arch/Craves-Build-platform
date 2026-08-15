package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderService;
import in.craves.order.web.ApiDtos.ChargePolicyRequest;
import in.craves.order.web.ApiDtos.ChargePolicyResponse;
import jakarta.validation.Valid;
import java.math.BigDecimal;
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
    public ChargePolicyResponse current() {
        return platformOnly(orderService.currentChargePolicy());
    }

    @PostMapping
    public ChargePolicyResponse create(
        @AuthenticationPrincipal CravesPrincipal principal,
        @Valid @RequestBody ChargePolicyRequest request
    ) {
        ChargePolicyRequest platformOnly = new ChargePolicyRequest(
            request.policyName(),
            request.platformFeePercent(),
            request.platformFeeFlat(),
            BigDecimal.ZERO,
            BigDecimal.ZERO
        );
        return platformOnly(orderService.createChargePolicy(principal, platformOnly));
    }

    private static ChargePolicyResponse platformOnly(ChargePolicyResponse policy) {
        return new ChargePolicyResponse(
            policy.id(),
            policy.policyName(),
            policy.platformFeePercent(),
            policy.platformFeeFlat(),
            BigDecimal.ZERO.setScale(2),
            BigDecimal.ZERO.setScale(2),
            policy.active(),
            policy.createdAt()
        );
    }
}
