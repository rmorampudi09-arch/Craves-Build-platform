package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderHistoryService;
import in.craves.order.service.OrderService;
import in.craves.order.web.ApiDtos.OrderResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final OrderService orderService;
    private final OrderHistoryService orderHistoryService;

    public OrderController(OrderService orderService, OrderHistoryService orderHistoryService) {
        this.orderService = orderService;
        this.orderHistoryService = orderHistoryService;
    }

    @GetMapping
    public List<OrderResponse> listOrders(@AuthenticationPrincipal CravesPrincipal principal) {
        return orderHistoryService.listCustomerOrders(principal, 50, null, null).orders();
    }

    @GetMapping("/{orderId}")
    public OrderResponse getOrder(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID orderId) {
        return orderService.getOrderForCustomer(principal, orderId);
    }
}
