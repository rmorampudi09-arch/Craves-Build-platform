package in.craves.advanced.semanticsearch;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SemanticSearchDtos {
    private SemanticSearchDtos() { }

    /** A phrase people type and what it means as Catalog searches: up to 4 search terms and/or Catalog filters. active defaults to true. */
    public record SearchConceptDraft(@NotBlank @Size(max = 60) String phrase,
                                     @NotNull @Size(max = 4) List<@NotBlank @Size(max = 40) String> searchTerms,
                                     @Pattern(regexp = "VEG|NON_VEG|EGG") String foodType,
                                     @Pattern(regexp = "MILD|MEDIUM|SPICY") String spiceLevel,
                                     @Size(max = 80) String category,
                                     Boolean active,
                                     Long expectedVersion) { }

    public record SearchConceptView(UUID id, String phrase, List<String> searchTerms, String foodType, String spiceLevel, String category,
                                    boolean active, long version, Instant updatedAt) { }

    /** One Catalog search; text null means filters only. */
    public record PlannedSearch(String text, boolean ownWords) { }

    /** How a query was understood: matched phrases, the searches run and the filters applied to all of them (dropped when concepts disagree). */
    public record SearchPlan(String query, String normalized, List<String> matchedPhrases, List<PlannedSearch> searches, String foodType,
                             String spiceLevel, String category) { }

    /** score: the person's own words count 2, each concept term 1; matchedBy names the searches that found it. */
    public record SemanticDish(UUID menuItemId, UUID kitchenId, String kitchenName, String itemName, String description, String category,
                               String foodType, String spiceLevel, Long pricePaise, long distanceMeters, String imageUrl, int score,
                               List<String> matchedBy) { }

    /** complete=false: some searches were skipped (deadline) or failed, so the list may be short. */
    public record SemanticSearchResult(SearchPlan plan, boolean complete, List<SemanticDish> dishes) { }
}
