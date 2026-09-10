package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderHistoryService;
import in.craves.order.web.ApiDtos.OrderStatus;
import in.craves.order.web.OrderHistoryDtos.OrderPageResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/chef/orders/page")
public class ChefOrderHistoryController {
    private final OrderHistoryService orderHistoryService;

    public ChefOrderHistoryController(OrderHistoryService orderHistoryService) {
        this.orderHistoryService = orderHistoryService;
    }

    @GetMapping
    public OrderPageResponse list(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(required = false) String cursor,
        @RequestParam(required = false) OrderStatus status
    ) {
        return orderHistoryService.listChefOrders(principal, limit, cursor, status);
    }
}
