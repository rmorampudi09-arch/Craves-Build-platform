package in.craves.order.web;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class OrderReviewDtos {
    private OrderReviewDtos() {
    }

    public record CreateOrderReviewRequest(
        @Min(1) @Max(5) int rating,
        @Size(max = 120) String reviewTitle,
        @Size(max = 1000) String reviewBody
    ) {
    }

    public record OrderReviewResponse(
        UUID id,
        UUID orderId,
        int rating,
        String reviewTitle,
        String reviewBody,
        Instant createdAt,
        Instant updatedAt
    ) {
    }
}
