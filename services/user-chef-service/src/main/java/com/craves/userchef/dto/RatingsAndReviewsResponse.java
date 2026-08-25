package com.craves.userchef.dto;

import java.time.Instant;
import java.util.List;

public record RatingsAndReviewsResponse(
        String chefId,
        int totalReviews,
        double averageRating,
        List<ReviewCard> reviews) {

    public record ReviewCard(String reviewId, String customerName, int rating, String comment, boolean verifiedOrder, Instant createdAt) {
    }
}
