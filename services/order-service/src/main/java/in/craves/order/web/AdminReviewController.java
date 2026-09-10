package in.craves.order.web;

import in.craves.order.exception.OrderApiException;
import in.craves.order.review.OrderReviewService;
import in.craves.order.review.ReviewModels.CustomerReviewView;
import in.craves.order.review.ReviewModels.ModerationRequest;
import in.craves.order.review.ReviewModels.Page;
import in.craves.order.review.ReviewModels.ReportView;
import in.craves.order.review.ReviewModels.ReviewStatus;
import in.craves.order.review.ReviewModels.TagDefinitionRequest;
import in.craves.order.review.ReviewModels.TagDefinitionView;
import in.craves.order.security.CravesPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/reviews")
public class AdminReviewController {
    private final OrderReviewService reviews;

    public AdminReviewController(OrderReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping
    public Page<CustomerReviewView> queue(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestParam(required = false) ReviewStatus status,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) String cursor
    ) {
        return reviews.listModerationQueue(principal, status, limit, cursor);
    }

    @PutMapping("/{reviewId}/moderation")
    public CustomerReviewView moderate(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID reviewId,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestBody ModerationRequest request
    ) {
        return reviews.moderate(principal, reviewId, request, reason);
    }

    @GetMapping("/{reviewId}/reports")
    public List<ReportView> reports(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable UUID reviewId
    ) {
        return reviews.listReports(principal, reviewId);
    }

    @GetMapping("/tags")
    public List<TagDefinitionView> tags(@AuthenticationPrincipal CravesPrincipal principal) {
        requireAdmin(principal);
        return reviews.listTagDefinitions(true);
    }

    @PutMapping("/tags/{code}")
    public TagDefinitionView upsertTag(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable String code,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestBody TagDefinitionRequest request
    ) {
        return reviews.upsertTagDefinition(principal, code, request, reason);
    }

    private static void requireAdmin(CravesPrincipal principal) {
        if (principal == null || !principal.hasAnyRole("ADMIN", "SUPPORT_ADMIN")) {
            throw new OrderApiException(HttpStatus.FORBIDDEN, "ROLE_REQUIRED", "ADMIN or SUPPORT_ADMIN role is required");
        }
    }
}
