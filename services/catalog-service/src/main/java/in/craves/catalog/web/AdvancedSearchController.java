package in.craves.catalog.web;

import in.craves.catalog.service.AdvancedSearchService;
import in.craves.catalog.web.AdvancedSearchDtos.SearchResponse;
import in.craves.catalog.web.ApiDtos.FoodType;
import java.math.BigDecimal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/discovery")
public class AdvancedSearchController {
    private final AdvancedSearchService advancedSearchService;

    public AdvancedSearchController(AdvancedSearchService advancedSearchService) {
        this.advancedSearchService = advancedSearchService;
    }

    @GetMapping("/search")
    public SearchResponse search(
        @RequestParam String q,
        @RequestParam BigDecimal latitude,
        @RequestParam BigDecimal longitude,
        @RequestParam int radiusMeters,
        @RequestParam(required = false) FoodType foodType,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) BigDecimal maxPrice,
        @RequestParam(required = false) Integer maxPreparationMinutes,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return advancedSearchService.search(
            q,
            latitude,
            longitude,
            radiusMeters,
            foodType,
            category,
            maxPrice,
            maxPreparationMinutes,
            page,
            size
        );
    }
}
