package in.craves.order.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.order.exception.OrderApiException;
import in.craves.order.review.ReviewModels.RatingDimension;
import in.craves.order.review.ReviewModels.ReviewSubmission;
import in.craves.order.review.ReviewModels.TagDefinitionRequest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReviewValidationTest {
    @Test
    void acceptsCompleteRatingDimensionsWithoutInventingOptionalValues() {
        var validated = ReviewValidation.validateSubmission(new ReviewSubmission(
            null, 5, 4, 3, 5, 4, 5, 2, "  Honest review  ", List.of(), List.of()
        ), false);

        assertThat(validated.overallRating()).isEqualTo(5);
        assertThat(validated.deliveryRating()).isEqualTo(2);
        assertThat(validated.reviewText()).isEqualTo("Honest review");
    }

    @Test
    void rejectsOutOfRangeRating() {
        assertThatThrownBy(() -> ReviewValidation.validateSubmission(new ReviewSubmission(
            null, 6, null, null, null, null, null, null, null, List.of(), List.of()
        ), false))
            .isInstanceOf(OrderApiException.class)
            .extracting(exception -> ((OrderApiException) exception).code())
            .isEqualTo("REVIEW_RATING_INVALID");
    }

    @Test
    void requiresOptimisticVersionOnlyForUpdate() {
        assertThatThrownBy(() -> ReviewValidation.validateSubmission(new ReviewSubmission(
            null, 5, null, null, null, null, null, null, null, List.of(), List.of()
        ), true))
            .isInstanceOf(OrderApiException.class)
            .extracting(exception -> ((OrderApiException) exception).code())
            .isEqualTo("REVIEW_VERSION_REQUIRED");

        assertThatThrownBy(() -> ReviewValidation.validateSubmission(new ReviewSubmission(
            1, 5, null, null, null, null, null, null, null, List.of(), List.of()
        ), false))
            .isInstanceOf(OrderApiException.class)
            .extracting(exception -> ((OrderApiException) exception).code())
            .isEqualTo("REVIEW_VERSION_NOT_ALLOWED");
    }

    @Test
    void normalizesTagCodesAndRejectsDuplicates() {
        var validated = ReviewValidation.validateSubmission(new ReviewSubmission(
            null, 5, null, null, null, null, null, null, null,
            List.of(" great_taste "), List.of()
        ), false);
        assertThat(validated.tagCodes()).containsExactly("GREAT_TASTE");

        assertThatThrownBy(() -> ReviewValidation.validateSubmission(new ReviewSubmission(
            null, 5, null, null, null, null, null, null, null,
            List.of("GOOD", "good"), List.of()
        ), false)).isInstanceOf(OrderApiException.class);
    }

    @Test
    void boundsReviewMediaAndText() {
        List<UUID> tooMany = List.of(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()
        );
        assertThatThrownBy(() -> ReviewValidation.validateSubmission(new ReviewSubmission(
            null, 5, null, null, null, null, null, null, "x", List.of(), tooMany
        ), false)).isInstanceOf(OrderApiException.class);

        assertThatThrownBy(() -> ReviewValidation.validateSubmission(new ReviewSubmission(
            null, 5, null, null, null, null, null, null, "x".repeat(2001), List.of(), List.of()
        ), false)).isInstanceOf(OrderApiException.class);
    }

    @Test
    void validatesAdminConfiguredTagInsteadOfSeedingProductTaxonomy() {
        var tag = ReviewValidation.validateTagDefinition(
            "  great_packaging ",
            new TagDefinitionRequest("Great packaging", RatingDimension.PACKAGING, true, 10)
        );
        assertThat(tag.code()).isEqualTo("GREAT_PACKAGING");
        assertThat(tag.dimension()).isEqualTo(RatingDimension.PACKAGING);
        assertThat(tag.active()).isTrue();
    }

    @Test
    void enforcesReasonAndPageBounds() {
        assertThatThrownBy(() -> ReviewValidation.validateAdminReason("short"))
            .isInstanceOf(OrderApiException.class);
        assertThatThrownBy(() -> ReviewValidation.validateLimit(51, 20, 50))
            .isInstanceOf(OrderApiException.class);
        assertThat(ReviewValidation.validateLimit(null, 20, 50)).isEqualTo(20);
    }
}
