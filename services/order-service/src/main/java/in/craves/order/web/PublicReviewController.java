package in.craves.order.web;

import in.craves.order.review.OrderReviewService;
import in.craves.order.review.ReviewModels.Page;
import in.craves.order.review.ReviewModels.PublicReviewView;
import in.craves.order.review.ReviewModels.ReviewSummary;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public/kitchens/{kitchenId}/reviews")
public class PublicReviewController {
    private final OrderReviewService reviews;

    public PublicReviewController(OrderReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    public Page<PublicReviewView> list(
        @PathVariable UUID kitchenId,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return reviews.listPublicKitchenReviews(kitchenId, limit, cursor);
    }

    @GetMapping("/summary")
    public ReviewSummary summary(@PathVariable UUID kitchenId) {
        return reviews.getPublicKitchenSummary(kitchenId);
    }
}
