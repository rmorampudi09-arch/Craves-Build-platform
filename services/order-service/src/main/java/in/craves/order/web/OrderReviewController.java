package in.craves.order.web;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderReviewService;
import in.craves.order.web.OrderReviewDtos.CreateOrderReviewRequest;
import in.craves.order.web.OrderReviewDtos.OrderReviewResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders/{orderId}/review")
public class OrderReviewController {
    private final OrderReviewService orderReviewService;

    public OrderReviewController(OrderReviewService orderReviewService) {
        this.orderReviewService = orderReviewService;
    }

    @GetMapping
    public OrderReviewResponse getReview(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId
    ) {
        return orderReviewService.getReview(principal, orderId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderReviewResponse createReview(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId,
        @Valid @RequestBody CreateOrderReviewRequest request
    ) {
        return orderReviewService.createReview(principal, orderId, request);
    }
}
