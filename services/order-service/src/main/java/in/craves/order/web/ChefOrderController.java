package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.ChefAcceptanceResolutionService;
import in.craves.order.service.ChefAcceptanceService;
import in.craves.order.service.ChefReadyForPickupService;
import in.craves.order.service.OrderHistoryService;
import in.craves.order.service.OrderService;
import in.craves.order.web.ApiDtos.ChefAcceptRequest;
import in.craves.order.web.ApiDtos.ChefRejectRequest;
import in.craves.order.web.ApiDtos.OrderResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/chef/orders")
public class ChefOrderController {
    private final OrderService orderService;
    private final OrderHistoryService orderHistoryService;
    private final ChefAcceptanceService chefAcceptanceService;
    private final ChefAcceptanceResolutionService chefAcceptanceResolutionService;
    private final ChefReadyForPickupService chefReadyForPickupService;

    public ChefOrderController(
        OrderService orderService,
        OrderHistoryService orderHistoryService,
        ChefAcceptanceService chefAcceptanceService,
        ChefAcceptanceResolutionService chefAcceptanceResolutionService,
        ChefReadyForPickupService chefReadyForPickupService
    ) {
        this.orderService = orderService;
        this.orderHistoryService = orderHistoryService;
        this.chefAcceptanceService = chefAcceptanceService;
        this.chefAcceptanceResolutionService = chefAcceptanceResolutionService;
        this.chefReadyForPickupService = chefReadyForPickupService;
    }

    @GetMapping
    public List<OrderResponse> listChefOrders(@AuthenticationPrincipal CravesPrincipal principal) {
        return orderHistoryService.listChefOrders(principal, 100, null, null).orders();
    }

    @GetMapping("/{orderId}")
    public OrderResponse getChefOrder(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID orderId) {
        return orderService.getOrderForChef(principal, orderId);
    }

    @PostMapping("/{orderId}/accept")
    public OrderResponse accept(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId,
        @Valid @RequestBody ChefAcceptRequest request,
        @RequestHeader(value = "X-Correlation-ID", required = false) UUID correlationId,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey
    ) {
        return chefAcceptanceService.accept(principal, orderId, request, correlationId, idempotencyKey);
    }

    @PostMapping("/{orderId}/reject")
    public OrderResponse reject(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId,
        @Valid @RequestBody ChefRejectRequest request,
        @RequestHeader(value = "X-Correlation-ID", required = false) UUID correlationId,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey
    ) {
        return chefAcceptanceResolutionService.reject(
            principal,
            orderId,
            request,
            correlationId,
            idempotencyKey
        );
    }

    @PostMapping("/{orderId}/ready-for-pickup")
    public OrderResponse readyForPickup(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID orderId) {
        return chefReadyForPickupService.markReady(principal, orderId);
    }
}
