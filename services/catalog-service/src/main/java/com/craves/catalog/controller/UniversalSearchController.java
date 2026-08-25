package com.craves.catalog.controller;

import com.craves.catalog.dto.UniversalSearchRequest;
import com.craves.catalog.dto.UniversalSearchResponse;
import com.craves.catalog.service.UniversalSearchService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog/search")
@Validated
public class UniversalSearchController {

    private final UniversalSearchService universalSearchService;

    public UniversalSearchController(UniversalSearchService universalSearchService) {
        this.universalSearchService = universalSearchService;
    }

    @GetMapping
    public ResponseEntity<UniversalSearchResponse> search(
            @RequestParam String q,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String customerId) {
        return ResponseEntity.ok(universalSearchService.search(new UniversalSearchRequest(q, lat, lng, page, size, customerId)));
    }

    @GetMapping("/suggestions")
    public ResponseEntity<List<String>> suggestions(@RequestParam String q) {
        return ResponseEntity.ok(universalSearchService.suggestions(q));
    }

    @GetMapping("/popular")
    public ResponseEntity<List<String>> popular() {
        return ResponseEntity.ok(universalSearchService.popularSearches());
    }

    @GetMapping("/recent")
    public ResponseEntity<List<String>> recent(@RequestParam String customerId) {
        return ResponseEntity.ok(universalSearchService.recentSearches(customerId));
    }

    @PostMapping("/recent")
    public ResponseEntity<Void> storeRecent(@Valid @RequestBody UniversalSearchRequest request) {
        universalSearchService.storeRecentSearch(request.customerId(), request.query());
        return ResponseEntity.accepted().build();
    }

    @DeleteMapping("/recent/{term}")
    public ResponseEntity<Void> deleteRecent(@RequestParam String customerId, @PathVariable String term) {
        universalSearchService.deleteRecentSearch(customerId, term);
        return ResponseEntity.noContent().build();
    }
}
