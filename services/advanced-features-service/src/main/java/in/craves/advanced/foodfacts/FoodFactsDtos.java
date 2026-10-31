package in.craves.advanced.foodfacts;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class FoodFactsDtos {
    private FoodFactsDtos() { }

    public enum Source { CHEF_DECLARED, LAB_TESTED, LABEL_DERIVED }

    public record Ingredient(@NotBlank @Size(max = 80) String name, Set<Allergen> allergens) { }

    /** Per serving. Unknown values stay null; nothing is estimated on the chef's behalf. */
    public record Nutrition(@DecimalMin("0") @DecimalMax("5000") BigDecimal energyKcal,
                            @DecimalMin("0") @DecimalMax("2000") BigDecimal proteinG,
                            @DecimalMin("0") @DecimalMax("2000") BigDecimal carbohydrateG,
                            @DecimalMin("0") @DecimalMax("2000") BigDecimal sugarsG,
                            @DecimalMin("0") @DecimalMax("2000") BigDecimal fatG,
                            @DecimalMin("0") @DecimalMax("2000") BigDecimal saturatedFatG,
                            @DecimalMin("0") @DecimalMax("2000") BigDecimal fibreG,
                            @DecimalMin("0") @DecimalMax("20000") BigDecimal sodiumMg) { }

    public record FactsContent(@NotEmpty @Size(max = 60) List<@Valid @NotNull Ingredient> ingredients,
                               Set<Allergen> allergens,
                               Set<Allergen> mayContain,
                               @Valid Nutrition nutrition,
                               @Min(1) @Max(5000) Integer servingSizeGrams,
                               @NotNull Source source,
                               @Size(max = 200) String evidenceReference) { }

    public record ChefFactsView(UUID menuItemId, String status, long version, FactsContent content, List<String> warnings,
                                String publishedLabel, Instant submittedAt, Instant reviewedAt, String reviewNote, Instant updatedAt) { }

    /** label: VERIFIED (checked by Craves staff) or CHEF_DECLARED (the chef's own declaration, not yet checked). */
    public record PublicFacts(UUID menuItemId, String label, List<Ingredient> ingredients, Set<Allergen> allergens,
                              Set<Allergen> mayContain, Nutrition nutrition, Integer servingSizeGrams, String source,
                              Instant publishedAt, String disclaimer) { }

    public record LookupRequest(@NotEmpty @Size(max = 100) List<@NotNull UUID> menuItemIds) { }

    public record Badge(UUID menuItemId, String label, Set<Allergen> allergens, Set<Allergen> mayContain, boolean hasNutrition) { }

    public record FreeFromPage(List<UUID> menuItemIds, String nextCursor) { }

    public record Review(@NotNull Long expectedVersion, @Size(max = 300) String note) { }

    public record QueueEntry(UUID menuItemId, UUID chefId, UUID kitchenId, long version, Instant submittedAt, FactsContent content,
                             List<String> warnings) { }

    public record QueuePage(List<QueueEntry> entries, String nextCursor) { }

    public record Vocabulary(List<Allergen> allergens, List<Source> sources, String disclaimer) { }
}
