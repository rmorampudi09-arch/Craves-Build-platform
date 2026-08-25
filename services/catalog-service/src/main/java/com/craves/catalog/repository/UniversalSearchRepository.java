package com.craves.catalog.repository;

import com.craves.catalog.entity.UniversalSearch;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

@Repository
public class UniversalSearchRepository {

    private final List<UniversalSearch> catalogue = List.of(
            new UniversalSearch("dish-1", "DISH", "Andhra Chicken Curry", "Spicy home-style curry · Chef Lakshmi", "https://cdn.craves.app/dishes/andhra-chicken-curry.jpg", "andhra chicken curry", 2.1, 32, true, 94, List.of("SPICY", "NON_VEG")),
            new UniversalSearch("dish-2", "DISH", "Paneer Millet Bowl", "Healthy high-protein meal · Chef Ananya", "https://cdn.craves.app/dishes/paneer-millet-bowl.jpg", "paneer millet bowl", 3.7, 28, true, 88, List.of("HEALTHY", "HIGH_PROTEIN", "VEG")),
            new UniversalSearch("chef-1", "CHEF", "Chef Lakshmi", "Andhra comfort food specialist", "https://cdn.craves.app/chefs/lakshmi.jpg", "chef lakshmi andhra comfort food", 2.4, 35, true, 96, List.of("TOP_RATED")),
            new UniversalSearch("kitchen-1", "KITCHEN", "Banjara Homemade Kitchen", "Fresh lunch boxes in Banjara Hills", "https://cdn.craves.app/kitchens/banjara-home.jpg", "banjara homemade kitchen lunch boxes", 1.9, 24, true, 91, List.of("FAST_DELIVERY")),
            new UniversalSearch("cuisine-1", "CUISINE", "Telangana Specials", "Regional spicy favourites", "https://cdn.craves.app/cuisines/telangana.jpg", "telangana specials", 4.0, 38, true, 76, List.of("REGIONAL")));

    private final Map<String, List<String>> recentSearches = new ConcurrentHashMap<>();

    public List<UniversalSearch> search(String query, Double lat, Double lng, int page, int size) {
        List<UniversalSearch> filtered = catalogue.stream()
                .filter(item -> item.queryText().contains(query) || item.displayName().toLowerCase().contains(query))
                .sorted(Comparator.comparingInt(UniversalSearch::popularity).reversed())
                .toList();
        int fromIndex = Math.min(page * size, filtered.size());
        int toIndex = Math.min(fromIndex + size, filtered.size());
        return filtered.subList(fromIndex, toIndex);
    }

    public List<String> suggestions(String query) {
        return catalogue.stream()
                .map(UniversalSearch::displayName)
                .filter(name -> name.toLowerCase().contains(query))
                .distinct()
                .sorted()
                .collect(Collectors.toList());
    }

    public List<String> popularSearches() {
        return List.of("chicken curry", "healthy meals", "biryani", "jain thali", "high protein");
    }

    public List<String> findRecentSearchTerms(String customerId) {
        return recentSearches.getOrDefault(customerId, List.of());
    }

    public void storeRecentSearch(String customerId, String query, Instant createdAt) {
        recentSearches.compute(customerId, (key, existing) -> {
            List<String> values = new ArrayList<>(existing == null ? List.of() : existing);
            values.remove(query);
            values.add(0, query);
            return values.stream().filter(StringUtils::hasText).limit(10).toList();
        });
    }

    public void deleteRecentSearch(String customerId, String query) {
        recentSearches.computeIfPresent(customerId, (key, existing) -> existing.stream().filter(term -> !term.equals(query)).toList());
    }
}
