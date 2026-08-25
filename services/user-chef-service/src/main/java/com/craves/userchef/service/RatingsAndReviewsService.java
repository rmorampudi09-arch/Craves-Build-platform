package com.craves.userchef.service;

import com.craves.userchef.dto.RatingsAndReviewsRequest;
import com.craves.userchef.dto.RatingsAndReviewsResponse;
import com.craves.userchef.entity.RatingsAndReviews;
import com.craves.userchef.repository.RatingsAndReviewsRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class RatingsAndReviewsService {

    private final RatingsAndReviewsRepository repository;

    public RatingsAndReviewsService(RatingsAndReviewsRepository repository) {
        this.repository = repository;
    }

    public RatingsAndReviewsResponse create(RatingsAndReviewsRequest request) {
        repository.save(new RatingsAndReviews(request.reviewId(), request.orderId(), request.kitchenId(), request.dishId(), request.chefId(), request.customerName(), request.rating(), request.comment(), true, Instant.now()));
        return summary(request.chefId());
    }

    public List<RatingsAndReviewsResponse.ReviewCard> byKitchen(String kitchenId) {
        return repository.findAll().stream().filter(review -> review.kitchenId().equals(kitchenId)).map(this::map).toList();
    }

    public List<RatingsAndReviewsResponse.ReviewCard> byDish(String dishId) {
        return repository.findAll().stream().filter(review -> review.dishId().equals(dishId)).map(this::map).toList();
    }

    public RatingsAndReviewsResponse summary(String chefId) {
        List<RatingsAndReviewsResponse.ReviewCard> reviews = repository.findAll().stream().filter(review -> review.chefId().equals(chefId)).map(this::map).toList();
        double average = reviews.stream().mapToInt(RatingsAndReviewsResponse.ReviewCard::rating).average().orElse(0.0);
        return new RatingsAndReviewsResponse(chefId, reviews.size(), Math.round(average * 10.0) / 10.0, reviews);
    }

    public void report(String reviewId) {
        repository.report(reviewId);
    }

    private RatingsAndReviewsResponse.ReviewCard map(RatingsAndReviews review) {
        return new RatingsAndReviewsResponse.ReviewCard(review.reviewId(), review.customerName(), review.rating(), review.comment(), review.verifiedOrder(), review.createdAt());
    }
}
