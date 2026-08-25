package in.craves.catalog.dto;

import java.util.List;

public record SmartSearchFilterResponse(
    String query,
    List<FacetGroup> facets,
    List<SearchResult> results
) {
    public record FacetGroup(String category, List<FacetOption> options) {}
    public record FacetOption(String code, String label) {}
    public record SearchResult(String kitchenId, String kitchenName, String dishName, String cuisine, String diet, int price, int etaMinutes) {}
}
