package in.craves.catalog.web;

import in.craves.catalog.service.SmartPersonalisedRecommendationsService;
import in.craves.catalog.web.SmartPersonalisedRecommendationsDtos.ResolveRecommendationsRequest;
import in.craves.catalog.web.SmartPersonalisedRecommendationsDtos.ResolveRecommendationsResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/discovery/recommendations")
public class SmartPersonalisedRecommendationsController {
    private final SmartPersonalisedRecommendationsService service;

    public SmartPersonalisedRecommendationsController(SmartPersonalisedRecommendationsService service) {
        this.service = service;
    }

    @PostMapping("/resolve")
    public ResolveRecommendationsResponse resolve(@RequestBody ResolveRecommendationsRequest request) {
        return service.resolve(request);
    }
}
