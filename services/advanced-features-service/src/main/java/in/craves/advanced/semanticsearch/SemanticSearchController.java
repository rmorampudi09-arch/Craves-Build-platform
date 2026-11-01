package in.craves.advanced.semanticsearch;

import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchPlan;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SemanticSearchResult;
import java.math.BigDecimal;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public, like Catalog discovery: no token needed and nothing about the caller is used or kept. */
@RestController
@RequestMapping("/api/v1/advanced/semantic-search")
public class SemanticSearchController {
    private final SemanticSearchService service;

    public SemanticSearchController(SemanticSearchService service) {
        this.service = service;
    }

    @GetMapping("/plan")
    public ResponseEntity<SearchPlan> semanticSearchPlan(@RequestParam("q") String q) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.plan(q));
    }

    @GetMapping("/dishes")
    public ResponseEntity<SemanticSearchResult> semanticSearchDishes(@RequestParam("q") String q, @RequestParam("latitude") BigDecimal latitude,
                                                                     @RequestParam("longitude") BigDecimal longitude,
                                                                     @RequestParam("radiusMeters") int radiusMeters) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.search(q, latitude, longitude, radiusMeters));
    }
}
