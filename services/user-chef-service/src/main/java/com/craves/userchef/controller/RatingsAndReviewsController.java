package com.craves.userchef.controller;

import com.craves.userchef.dto.RatingsAndReviewsRequest;
import com.craves.userchef.dto.RatingsAndReviewsResponse;
import com.craves.userchef.service.RatingsAndReviewsService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reviews")
public class RatingsAndReviewsController {

    private final RatingsAndReviewsService service;

    public RatingsAndReviewsController(RatingsAndReviewsService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<RatingsAndReviewsResponse> create(@Valid @RequestBody RatingsAndReviewsRequest request) {
        return ResponseEntity.ok(service.create(request));
    }

    @GetMapping("/kitchens/{kitchenId}")
    public ResponseEntity<List<RatingsAndReviewsResponse.ReviewCard>> kitchens(@PathVariable String kitchenId) {
        return ResponseEntity.ok(service.byKitchen(kitchenId));
    }

    @GetMapping("/dishes/{dishId}")
    public ResponseEntity<List<RatingsAndReviewsResponse.ReviewCard>> dishes(@PathVariable String dishId) {
        return ResponseEntity.ok(service.byDish(dishId));
    }

    @GetMapping("/chefs/{chefId}/summary")
    public ResponseEntity<RatingsAndReviewsResponse> chefSummary(@PathVariable String chefId) {
        return ResponseEntity.ok(service.summary(chefId));
    }

    @PostMapping("/{reviewId}/report")
    public ResponseEntity<Void> report(@PathVariable String reviewId) {
        service.report(reviewId);
        return ResponseEntity.accepted().build();
    }
}
