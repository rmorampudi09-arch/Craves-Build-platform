package in.craves.order.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class OfferEngineDtos {
    private OfferEngineDtos() {
    }

    public record OfferCodeRequest(
        @NotBlank @Size(max = 40) String code
    ) {
    }

    public record OfferResponse(
        UUID id,
        String code,
        String title,
        String description,
        String discountType,
        BigDecimal discountValue,
        BigDecimal maxDiscountAmount,
        BigDecimal minimumFoodSubtotal,
        String currency,
        BigDecimal discountAmount,
        BigDecimal foodSubtotal,
        BigDecimal foodSubtotalAfterDiscount,
        Instant startsAt,
        Instant endsAt
    ) {
    }
}
