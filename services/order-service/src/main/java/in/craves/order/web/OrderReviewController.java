package in.craves.order.web;

import in.craves.order.review.OrderReviewService;
import in.craves.order.review.ReviewModels.CustomerReviewView;
import in.craves.order.review.ReviewModels.ReviewSubmission;
import in.craves.order.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders/{orderId}/review")
public class OrderReviewController {
    private final OrderReviewService reviews;

    public OrderReviewController(OrderReviewService reviews) {
        this.reviews = reviews;
    }

    @PostMapping
    public CustomerReviewView create(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId,
        @RequestBody ReviewSubmission request
    ) {
        return reviews.createReview(principal, orderId, request);
    }

    @PutMapping
    public CustomerReviewView update(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId,
        @RequestBody ReviewSubmission request
    ) {
        return reviews.updateReview(principal, orderId, request);
    }

    @GetMapping
    public CustomerReviewView get(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID orderId
    ) {
        return reviews.getOwnReview(principal, orderId);
    }
}
