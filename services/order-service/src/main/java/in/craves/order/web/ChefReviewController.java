package in.craves.order.web;

import in.craves.order.review.OrderReviewService;
import in.craves.order.review.ReviewModels.Page;
import in.craves.order.review.ReviewModels.PublicReviewView;
import in.craves.order.review.ReviewModels.ReviewSummary;
import in.craves.order.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/chef/reviews")
public class ChefReviewController {
    private final OrderReviewService reviews;

    public ChefReviewController(OrderReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    public Page<PublicReviewView> list(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam(required = false) UUID kitchenId,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return reviews.listChefReviews(principal, kitchenId, limit, cursor);
    }

    @GetMapping("/kitchens/{kitchenId}/summary")
    public ReviewSummary summary(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID kitchenId
    ) {
        return reviews.getChefKitchenSummary(principal, kitchenId);
    }
}
