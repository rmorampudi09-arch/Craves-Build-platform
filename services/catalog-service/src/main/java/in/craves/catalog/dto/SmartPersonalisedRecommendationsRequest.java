package in.craves.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SmartPersonalisedRecommendationsRequest(
        @NotNull Long chefId,
        @NotNull Long dishId,
        @NotBlank String title,
        @NotBlank String reason,
        @NotNull Double score,
        @NotBlank String tagline
) {}
