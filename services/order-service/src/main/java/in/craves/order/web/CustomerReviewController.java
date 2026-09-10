package in.craves.order.web;

import in.craves.order.review.OrderReviewService;
import in.craves.order.review.ReviewModels.CustomerReviewView;
import in.craves.order.review.ReviewModels.HelpfulResponse;
import in.craves.order.review.ReviewModels.Page;
import in.craves.order.review.ReviewModels.ReportRequest;
import in.craves.order.review.ReviewModels.ReportView;
import in.craves.order.review.ReviewModels.TagDefinitionView;
import in.craves.order.security.CravesPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reviews")
public class CustomerReviewController {
    private final OrderReviewService reviews;

    public CustomerReviewController(OrderReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping("/mine")
    public Page<CustomerReviewView> mine(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return reviews.listOwnReviews(principal, limit, cursor);
    }

    @GetMapping("/tags")
    public List<TagDefinitionView> activeTags() {
        return reviews.listTagDefinitions(false);
    }

    @PutMapping("/{reviewId}/helpful")
    public HelpfulResponse markHelpful(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID reviewId
    ) {
        return reviews.markHelpful(principal, reviewId);
    }

    @DeleteMapping("/{reviewId}/helpful")
    public HelpfulResponse removeHelpful(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID reviewId
    ) {
        return reviews.removeHelpful(principal, reviewId);
    }

    @PostMapping("/{reviewId}/reports")
    public ReportView report(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID reviewId,
        @RequestBody ReportRequest request
    ) {
        return reviews.reportReview(principal, reviewId, request);
    }
}
