package in.craves.order.review;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ReviewModels {
    private ReviewModels() {
    }

    public enum ReviewStatus {
        PENDING_MODERATION,
        PUBLISHED,
        HIDDEN,
        REJECTED
    }

    public enum ModerationAction {
        PUBLISH,
        HIDE,
        REJECT
    }

    public enum RatingDimension {
        OVERALL,
        FOOD_TASTE,
        PORTION_VALUE,
        PACKAGING,
        ACCURACY,
        CHEF_PREPARATION,
        DELIVERY
    }

    public record ReviewSubmission(
        Integer expectedVersion,
        Integer overallRating,
        Integer foodTasteRating,
        Integer portionValueRating,
        Integer packagingRating,
        Integer accuracyRating,
        Integer chefPreparationRating,
        Integer deliveryRating,
        String reviewText,
        List<String> tagCodes,
        List<UUID> mediaAssetIds
    ) {
    }

    public record CustomerReviewView(
        UUID reviewId,
        UUID orderId,
        UUID kitchenId,
        ReviewStatus status,
        int version,
        Integer overallRating,
        Integer foodTasteRating,
        Integer portionValueRating,
        Integer packagingRating,
        Integer accuracyRating,
        Integer chefPreparationRating,
        Integer deliveryRating,
        String reviewText,
        List<String> tagCodes,
        List<UUID> mediaAssetIds,
        long helpfulCount,
        Instant submittedAt,
        Instant updatedAt,
        Instant publishedAt
    ) {
    }

    public record PublicReviewView(
        UUID reviewId,
        UUID kitchenId,
        Integer overallRating,
        Integer foodTasteRating,
        Integer portionValueRating,
        Integer packagingRating,
        Integer accuracyRating,
        Integer chefPreparationRating,
        Integer deliveryRating,
        String reviewText,
        List<String> tagCodes,
        List<UUID> mediaAssetIds,
        long helpfulCount,
        Instant publishedAt
    ) {
    }

    public record ReviewSummary(
        UUID kitchenId,
        long reviewCount,
        BigDecimal overallAverage,
        BigDecimal foodTasteAverage,
        BigDecimal portionValueAverage,
        BigDecimal packagingAverage,
        BigDecimal accuracyAverage,
        BigDecimal chefPreparationAverage,
        BigDecimal deliveryAverage
    ) {
    }

    public record Page<T>(List<T> items, String nextCursor, boolean hasMore) {
        public Page {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    public record TagDefinitionRequest(
        String displayLabel,
        RatingDimension dimension,
        Boolean active,
        Integer sortOrder
    ) {
    }

    public record TagDefinitionView(
        String code,
        String displayLabel,
        RatingDimension dimension,
        boolean active,
        int sortOrder,
        Instant updatedAt
    ) {
    }

    public record ModerationRequest(ModerationAction action) {
    }

    public record HelpfulResponse(UUID reviewId, boolean helpfulByCaller, long helpfulCount) {
    }

    public record ReportRequest(String reasonCode, String detail) {
    }

    public record ReportView(
        UUID reportId,
        UUID reviewId,
        String reasonCode,
        String detail,
        Instant createdAt
    ) {
    }
}
