package in.craves.order.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CartPreflightDtos {
    private CartPreflightDtos() {
    }

    public enum CartPreflightIssueCode {
        MENU_ITEM_UNAVAILABLE,
        DELIVERY_METADATA_MISSING,
        PRICE_CHANGED,
        KITCHEN_CHANGED,
        ITEM_NAME_CHANGED
    }

    public record CartItemPreflightResponse(
        UUID cartItemId,
        UUID menuItemId,
        int quantity,
        boolean activeAndAvailable,
        boolean blockingIssue,
        BigDecimal cartUnitPrice,
        BigDecimal currentUnitPrice,
        UUID cartKitchenId,
        UUID currentKitchenId,
        String cartItemName,
        String currentItemName,
        List<CartPreflightIssueCode> issues
    ) {
        public CartItemPreflightResponse {
            issues = issues == null ? List.of() : List.copyOf(issues);
        }
    }

    public record CartPreflightResponse(
        UUID cartId,
        boolean readyForCurrentCheckoutValidation,
        boolean hasReviewChanges,
        int itemCount,
        int blockingIssueCount,
        int reviewChangeCount,
        Instant checkedAt,
        List<CartItemPreflightResponse> items
    ) {
        public CartPreflightResponse {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }
}
