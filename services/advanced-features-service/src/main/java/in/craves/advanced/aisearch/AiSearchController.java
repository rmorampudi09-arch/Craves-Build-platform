package in.craves.advanced.aisearch;

import in.craves.advanced.aisearch.AiSearchDtos.AiSearchDishesRequest;
import in.craves.advanced.aisearch.AiSearchDtos.AiSearchDishesResult;
import in.craves.advanced.aisearch.AiSearchDtos.AiSearchPlanRequest;
import in.craves.advanced.aisearch.AiSearchDtos.AiSearchPlanResult;
import in.craves.advanced.platform.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Signed in, POST because the chat goes in the body; nothing is stored. */
@RestController
@RequestMapping("/api/v1/advanced/ai-search")
public class AiSearchController {
    private final AiSearchService service;

    public AiSearchController(AiSearchService service) {
        this.service = service;
    }

    @PostMapping("/plan")
    public ResponseEntity<AiSearchPlanResult> aiSearchPlan(@Valid @RequestBody AiSearchPlanRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.plan(CurrentUser.id(), request.messages()));
    }

    @PostMapping("/dishes")
    public ResponseEntity<AiSearchDishesResult> aiSearchDishes(@Valid @RequestBody AiSearchDishesRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.dishes(CurrentUser.id(), request.messages(),
                request.latitude(), request.longitude(), request.radiusMeters()));
    }
}
