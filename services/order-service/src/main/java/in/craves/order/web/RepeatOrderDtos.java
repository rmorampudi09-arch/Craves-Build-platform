package in.craves.order.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RepeatOrderDtos {
    private RepeatOrderDtos() {
    }

    public record RepeatOrderItem(
        UUID menuItemId,
        String itemName,
        int quantity
    ) {
    }

    public record RepeatOrderCandidate(
        UUID orderId,
        UUID kitchenId,
        String kitchenName,
        Instant lastOrderedAt,
        int completedOrdersFromKitchen,
        List<RepeatOrderItem> items,
        BigDecimal previousOrderTotal,
        String previousOrderCurrency,
        boolean orderLikeLastTimeAvailable,
        boolean preferenceRecallSupported,
        int rememberedPreferenceCount,
        String currentValidationNotice
    ) {
    }

    public record RepeatOrderPage(
        List<RepeatOrderCandidate> items,
        String nextCursor,
        boolean hasMore
    ) {
    }
}
