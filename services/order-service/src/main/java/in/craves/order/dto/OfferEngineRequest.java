package in.craves.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record OfferEngineRequest(
        @NotBlank String code,
        @NotBlank String description,
        @NotNull BigDecimal discountAmount,
        @NotNull BigDecimal minimumCartValue,
        @NotNull BigDecimal cartValue,
        boolean autoApply
) {}
