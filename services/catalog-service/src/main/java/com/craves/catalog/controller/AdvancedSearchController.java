package com.craves.catalog.controller;

import com.craves.catalog.dto.AdvancedSearchRequest;
import com.craves.catalog.dto.AdvancedSearchResponse;
import com.craves.catalog.dto.SearchSuggestionResponse;
import com.craves.catalog.service.AdvancedSearchService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog")
public class AdvancedSearchController {

    private final AdvancedSearchService advancedSearchService;

    public AdvancedSearchController(AdvancedSearchService advancedSearchService) {
        this.advancedSearchService = advancedSearchService;
    }

    @GetMapping("/search")
    public ResponseEntity<List<AdvancedSearchResponse>> search(@Valid @ModelAttribute AdvancedSearchRequest request) {
        return ResponseEntity.ok(advancedSearchService.search(request));
    }

    @GetMapping("/suggestions")
    public ResponseEntity<List<SearchSuggestionResponse>> suggestions(@ModelAttribute AdvancedSearchRequest request) {
        return ResponseEntity.ok(advancedSearchService.suggestions(request.query()));
    }
}
