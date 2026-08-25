package in.craves.catalog.controller;

import in.craves.catalog.dto.SmartPersonalisedRecommendationsRequest;
import in.craves.catalog.dto.SmartPersonalisedRecommendationsResponse;
import in.craves.catalog.service.SmartPersonalisedRecommendationsService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog/recommendations")
@Validated
public class SmartPersonalisedRecommendationsController {

    private final SmartPersonalisedRecommendationsService recommendationsService;

    public SmartPersonalisedRecommendationsController(SmartPersonalisedRecommendationsService recommendationsService) {
        this.recommendationsService = recommendationsService;
    }

    @GetMapping("/home")
    public List<SmartPersonalisedRecommendationsResponse> getHomeRecommendations(@RequestHeader("X-Customer-Id") Long customerId) {
        return recommendationsService.getRecommendations(customerId);
    }

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void captureRecommendationEvent(@RequestHeader("X-Customer-Id") Long customerId,
                                           @Valid @RequestBody SmartPersonalisedRecommendationsRequest request) {
        recommendationsService.captureEvent(customerId, request);
    }
}
