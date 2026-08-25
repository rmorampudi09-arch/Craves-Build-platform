package com.craves.userchef.entity;

import java.time.Instant;

public record RatingsAndReviews(
        String reviewId,
        String orderId,
        String kitchenId,
        String dishId,
        String chefId,
        String customerName,
        int rating,
        String comment,
        boolean verifiedOrder,
        Instant createdAt) {
}
