package com.craves.userchef.repository;

import com.craves.userchef.entity.RatingsAndReviews;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class RatingsAndReviewsRepository {

    private final List<RatingsAndReviews> reviews = new ArrayList<>(List.of(
            new RatingsAndReviews("review-1", "order-1", "kitchen-1", "dish-1", "chef-1", "Sana", 5, "Authentic homemade taste and great packaging.", true, Instant.parse("2026-08-22T12:30:00Z")),
            new RatingsAndReviews("review-2", "order-2", "kitchen-1", "dish-1", "chef-1", "Rahul", 4, "Spicy and fresh. Would order again.", true, Instant.parse("2026-08-23T12:30:00Z"))));

    public List<RatingsAndReviews> findAll() {
        return List.copyOf(reviews);
    }

    public void save(RatingsAndReviews review) {
        reviews.add(review);
    }

    public void report(String reviewId) {
        // retained for moderation workflow handoff
    }
}
