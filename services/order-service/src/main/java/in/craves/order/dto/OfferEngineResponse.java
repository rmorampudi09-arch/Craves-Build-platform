package in.craves.order.dto;

import java.math.BigDecimal;

public record OfferEngineResponse(
        Long id,
        String code,
        String description,
        BigDecimal discountAmount,
        BigDecimal minimumCartValue,
        boolean autoApply,
        boolean active
) {}
