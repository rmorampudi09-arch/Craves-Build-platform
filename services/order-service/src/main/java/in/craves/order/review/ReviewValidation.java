package in.craves.order.review;

import in.craves.order.exception.OrderApiException;
import in.craves.order.review.ReviewModels.RatingDimension;
import in.craves.order.review.ReviewModels.ReviewSubmission;
import in.craves.order.review.ReviewModels.TagDefinitionRequest;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

public final class ReviewValidation {
    private static final Pattern CODE_PATTERN = Pattern.compile("^[A-Z0-9_]{1,64}$");
    private static final int MAX_TAGS = 10;
    private static final int MAX_MEDIA = 5;

    private ReviewValidation() {
    }

    public static ValidatedReview validateSubmission(ReviewSubmission request, boolean update) {
        if (request == null) {
            throw OrderApiException.badRequest("REVIEW_REQUEST_REQUIRED", "Review request is required");
        }
        if (update) {
            if (request.expectedVersion() == null || request.expectedVersion() < 1) {
                throw OrderApiException.badRequest(
                    "REVIEW_VERSION_REQUIRED",
                    "A positive expectedVersion is required when updating a review"
                );
            }
        } else if (request.expectedVersion() != null) {
            throw OrderApiException.badRequest(
                "REVIEW_VERSION_NOT_ALLOWED",
                "expectedVersion is only allowed when updating a review"
            );
        }

        int overall = requiredRating("overallRating", request.overallRating());
        Integer foodTaste = optionalRating("foodTasteRating", request.foodTasteRating());
        Integer portionValue = optionalRating("portionValueRating", request.portionValueRating());
        Integer packaging = optionalRating("packagingRating", request.packagingRating());
        Integer accuracy = optionalRating("accuracyRating", request.accuracyRating());
        Integer chefPreparation = optionalRating("chefPreparationRating", request.chefPreparationRating());
        Integer delivery = optionalRating("deliveryRating", request.deliveryRating());
        String text = trimToNull(request.reviewText());
        if (text != null && text.length() > 2000) {
            throw OrderApiException.badRequest("REVIEW_TEXT_TOO_LONG", "Review text must be at most 2000 characters");
        }

        List<String> tagCodes = normalizeCodes(request.tagCodes(), MAX_TAGS, "REVIEW_TAGS_INVALID");
        List<UUID> mediaAssetIds = normalizeMedia(request.mediaAssetIds());

        return new ValidatedReview(
            request.expectedVersion(),
            overall,
            foodTaste,
            portionValue,
            packaging,
            accuracy,
            chefPreparation,
            delivery,
            text,
            tagCodes,
            mediaAssetIds
        );
    }

    public static String validateTagCode(String code) {
        String normalized = normalizeCode(code, "REVIEW_TAG_CODE_INVALID");
        if (!CODE_PATTERN.matcher(normalized).matches()) {
            throw OrderApiException.badRequest(
                "REVIEW_TAG_CODE_INVALID",
                "Review tag code must contain only A-Z, 0-9 and underscore and be at most 64 characters"
            );
        }
        return normalized;
    }

    public static ValidatedTagDefinition validateTagDefinition(String code, TagDefinitionRequest request) {
        String normalizedCode = validateTagCode(code);
        if (request == null) {
            throw OrderApiException.badRequest("REVIEW_TAG_REQUEST_REQUIRED", "Review tag request is required");
        }
        String label = trimToNull(request.displayLabel());
        if (label == null || label.length() > 100) {
            throw OrderApiException.badRequest(
                "REVIEW_TAG_LABEL_INVALID",
                "Review tag displayLabel must be between 1 and 100 characters"
            );
        }
        RatingDimension dimension = request.dimension();
        if (dimension == null) {
            throw OrderApiException.badRequest("REVIEW_TAG_DIMENSION_REQUIRED", "Review tag dimension is required");
        }
        boolean active = Boolean.TRUE.equals(request.active());
        int sortOrder = request.sortOrder() == null ? 0 : request.sortOrder();
        if (sortOrder < -100000 || sortOrder > 100000) {
            throw OrderApiException.badRequest(
                "REVIEW_TAG_SORT_ORDER_INVALID",
                "Review tag sortOrder must be between -100000 and 100000"
            );
        }
        return new ValidatedTagDefinition(normalizedCode, label, dimension, active, sortOrder);
    }

    public static String validateReportReasonCode(String code) {
        return validateTagCode(code);
    }

    public static String validateReportDetail(String detail) {
        String normalized = trimToNull(detail);
        if (normalized != null && normalized.length() > 1000) {
            throw OrderApiException.badRequest("REVIEW_REPORT_DETAIL_TOO_LONG", "Report detail must be at most 1000 characters");
        }
        return normalized;
    }

    public static String validateAdminReason(String reason) {
        String normalized = trimToNull(reason);
        if (normalized == null || normalized.length() < 10 || normalized.length() > 500) {
            throw OrderApiException.badRequest(
                "ADMIN_REASON_INVALID",
                "X-Admin-Reason must be between 10 and 500 characters"
            );
        }
        return normalized;
    }

    public static int validateLimit(Integer limit, int defaultValue, int maximum) {
        int resolved = limit == null ? defaultValue : limit;
        if (resolved < 1 || resolved > maximum) {
            throw OrderApiException.badRequest(
                "REVIEW_LIMIT_INVALID",
                "Review limit must be between 1 and " + maximum
            );
        }
        return resolved;
    }

    private static int requiredRating(String field, Integer value) {
        if (value == null) {
            throw OrderApiException.badRequest("REVIEW_RATING_REQUIRED", field + " is required");
        }
        return rating(field, value);
    }

    private static Integer optionalRating(String field, Integer value) {
        return value == null ? null : rating(field, value);
    }

    private static int rating(String field, int value) {
        if (value < 1 || value > 5) {
            throw OrderApiException.badRequest("REVIEW_RATING_INVALID", field + " must be between 1 and 5");
        }
        return value;
    }

    private static List<String> normalizeCodes(List<String> values, int maximum, String errorCode) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        if (values.size() > maximum) {
            throw OrderApiException.badRequest(errorCode, "At most " + maximum + " review tags are allowed");
        }
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : values) {
            normalized.add(validateTagCode(value));
        }
        if (normalized.size() != values.size()) {
            throw OrderApiException.badRequest(errorCode, "Duplicate review tags are not allowed");
        }
        return List.copyOf(normalized);
    }

    private static List<UUID> normalizeMedia(List<UUID> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        if (values.size() > MAX_MEDIA) {
            throw OrderApiException.badRequest("REVIEW_MEDIA_INVALID", "At most five review media assets are allowed");
        }
        if (values.stream().anyMatch(java.util.Objects::isNull)) {
            throw OrderApiException.badRequest("REVIEW_MEDIA_INVALID", "Review media asset IDs cannot be null");
        }
        LinkedHashSet<UUID> distinct = new LinkedHashSet<>(values);
        if (distinct.size() != values.size()) {
            throw OrderApiException.badRequest("REVIEW_MEDIA_INVALID", "Duplicate review media assets are not allowed");
        }
        return List.copyOf(distinct);
    }

    private static String normalizeCode(String value, String errorCode) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw OrderApiException.badRequest(errorCode, "Code is required");
        }
        return normalized.toUpperCase(Locale.ROOT);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record ValidatedReview(
        Integer expectedVersion,
        int overallRating,
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

    public record ValidatedTagDefinition(
        String code,
        String displayLabel,
        RatingDimension dimension,
        boolean active,
        int sortOrder
    ) {
    }
}
