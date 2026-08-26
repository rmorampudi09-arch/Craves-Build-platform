package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.CustomerReviewService;
import in.craves.userchef.service.CustomerReviewService.ChefRatingSummaryResponse;
import in.craves.userchef.service.CustomerReviewService.CreateCustomerReviewRequest;
import in.craves.userchef.service.CustomerReviewService.CustomerReviewResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customer-reviews")
@Validated
public class CustomerReviewController {
    private final CustomerReviewService customerReviewService;

    public CustomerReviewController(CustomerReviewService customerReviewService) {
        this.customerReviewService = customerReviewService;
    }

    @PostMapping
    public CustomerReviewResponse submit(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody CustomerReviewRequest request
    ) {
        return customerReviewService.submit(
            user,
            new CreateCustomerReviewRequest(
                request.orderId(),
                request.chefIdentityId(),
                request.menuItemId(),
                request.rating(),
                request.title(),
                request.reviewText()
            )
        );
    }

    @GetMapping("/chefs/{chefIdentityId}")
    public List<CustomerReviewResponse> listChefReviews(
        @PathVariable UUID chefIdentityId,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit
    ) {
        return customerReviewService.listChefReviews(chefIdentityId, limit);
    }

    @GetMapping("/chefs/{chefIdentityId}/summary")
    public ChefRatingSummaryResponse chefSummary(@PathVariable UUID chefIdentityId) {
        return customerReviewService.getChefRatingSummary(chefIdentityId);
    }

    @GetMapping("/menu-items/{menuItemId}")
    public List<CustomerReviewResponse> listMenuItemReviews(
        @PathVariable UUID menuItemId,
        @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit
    ) {
        return customerReviewService.listMenuItemReviews(menuItemId, limit);
    }

    public record CustomerReviewRequest(
        @NotNull UUID orderId,
        @NotNull UUID chefIdentityId,
        UUID menuItemId,
        @Min(1) @Max(5) int rating,
        String title,
        String reviewText
    ) {
    }
}
