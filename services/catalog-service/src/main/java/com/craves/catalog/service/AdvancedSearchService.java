package com.craves.catalog.service;

import com.craves.catalog.dto.AdvancedSearchRequest;
import com.craves.catalog.dto.AdvancedSearchResponse;
import com.craves.catalog.dto.SearchSuggestionResponse;
import com.craves.catalog.entity.AdvancedSearch;
import com.craves.catalog.repository.AdvancedSearchRepository;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdvancedSearchService {

    private final AdvancedSearchRepository advancedSearchRepository;

    public AdvancedSearchService(AdvancedSearchRepository advancedSearchRepository) {
        this.advancedSearchRepository = advancedSearchRepository;
    }

    @Transactional(readOnly = true)
    public List<AdvancedSearchResponse> search(AdvancedSearchRequest request) {
        return advancedSearchRepository.search(request.query(), request.vegOnly(), request.healthyOnly(), request.maxPrice())
                .stream()
                .map(item -> new AdvancedSearchResponse(
                        item.getId(),
                        item.getDishName(),
                        item.getChefName(),
                        item.getCuisine(),
                        item.getLocality(),
                        item.isVeg(),
                        item.isHealthy(),
                        item.getPrice(),
                        item.getRating(),
                        item.getEtaMinutes(),
                        item.getTags()))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SearchSuggestionResponse> suggestions(String query) {
        String normalized = query == null ? "" : query.toLowerCase(Locale.ROOT);
        return advancedSearchRepository.findTop10ByDishNameContainingIgnoreCaseOrChefNameContainingIgnoreCase(normalized, normalized)
                .stream()
                .map(item -> new SearchSuggestionResponse(item.getId(), item.getDishName(), item.getChefName(), item.getCuisine()))
                .collect(Collectors.toList());
    }
}
