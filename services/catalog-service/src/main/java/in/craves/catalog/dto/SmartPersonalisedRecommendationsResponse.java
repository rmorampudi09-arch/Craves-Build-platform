package in.craves.catalog.dto;

public record SmartPersonalisedRecommendationsResponse(
        Long id,
        Long chefId,
        Long dishId,
        String title,
        String reason,
        Double score,
        String tagline
) {}
