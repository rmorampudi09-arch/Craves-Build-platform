package com.craves.catalog.service;

import com.craves.catalog.dto.UniversalSearchRequest;
import com.craves.catalog.dto.UniversalSearchResponse;
import com.craves.catalog.entity.UniversalSearch;
import com.craves.catalog.repository.UniversalSearchRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class UniversalSearchService {

    private final UniversalSearchRepository universalSearchRepository;

    public UniversalSearchService(UniversalSearchRepository universalSearchRepository) {
        this.universalSearchRepository = universalSearchRepository;
    }

    public UniversalSearchResponse search(UniversalSearchRequest request) {
        String normalizedQuery = normalize(request.query());
        List<UniversalSearch> matches = universalSearchRepository.search(normalizedQuery, request.lat(), request.lng(), request.page(), request.size());
        List<UniversalSearchResponse.SearchHit> hits = matches.stream()
                .map(this::toHit)
                .sorted(Comparator.comparingDouble(UniversalSearchResponse.SearchHit::score).reversed())
                .toList();

        Map<String, Long> counts = hits.stream()
                .collect(Collectors.groupingBy(UniversalSearchResponse.SearchHit::type, LinkedHashMap::new, Collectors.counting()));

        if (StringUtils.hasText(request.customerId())) {
            storeRecentSearch(request.customerId(), request.query());
        }

        return new UniversalSearchResponse(
                request.query(),
                request.page(),
                request.size(),
                hits.size(),
                counts,
                hits,
                suggestions(request.query()));
    }

    public List<String> suggestions(String query) {
        String normalizedQuery = normalize(query);
        if (!StringUtils.hasText(normalizedQuery)) {
            return popularSearches();
        }
        return universalSearchRepository.suggestions(normalizedQuery).stream().limit(8).toList();
    }

    public List<String> popularSearches() {
        return universalSearchRepository.popularSearches();
    }

    public List<String> recentSearches(String customerId) {
        return universalSearchRepository.findRecentSearchTerms(customerId);
    }

    public void storeRecentSearch(String customerId, String query) {
        if (!StringUtils.hasText(customerId) || !StringUtils.hasText(query)) {
            return;
        }
        universalSearchRepository.storeRecentSearch(customerId.trim(), normalize(query), Instant.now());
    }

    public void deleteRecentSearch(String customerId, String term) {
        if (!StringUtils.hasText(customerId) || !StringUtils.hasText(term)) {
            return;
        }
        universalSearchRepository.deleteRecentSearch(customerId.trim(), normalize(term));
    }

    private UniversalSearchResponse.SearchHit toHit(UniversalSearch entity) {
        double textScore = computeTextScore(entity.queryText(), entity.displayName());
        double geoScore = entity.distanceKm() == null ? 0.35 : Math.max(0.0, 1.0 - Math.min(entity.distanceKm() / 15.0, 1.0));
        double availabilityScore = entity.availableNow() ? 1.0 : 0.2;
        double popularityScore = Math.min(entity.popularity() / 100.0, 1.0);
        double score = (textScore * 0.45) + (geoScore * 0.25) + (availabilityScore * 0.15) + (popularityScore * 0.15);
        List<String> tags = new ArrayList<>();
        if (entity.availableNow()) {
            tags.add("OPEN_NOW");
        }
        if (entity.distanceKm() != null && entity.distanceKm() <= 3.0) {
            tags.add("NEARBY");
        }
        tags.addAll(entity.tags());
        return new UniversalSearchResponse.SearchHit(
                entity.id(),
                entity.type(),
                entity.displayName(),
                entity.subtitle(),
                entity.imageUrl(),
                entity.distanceKm(),
                entity.deliveryEtaMinutes(),
                entity.availableNow(),
                Math.round(score * 1000.0) / 1000.0,
                tags.stream().filter(Objects::nonNull).distinct().toList());
    }

    private double computeTextScore(String query, String target) {
        String normalizedTarget = normalize(target);
        if (!StringUtils.hasText(query)) {
            return 0.0;
        }
        if (normalizedTarget.equals(query)) {
            return 1.0;
        }
        if (normalizedTarget.startsWith(query)) {
            return 0.92;
        }
        if (normalizedTarget.contains(query)) {
            return 0.78;
        }
        return 0.4;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
