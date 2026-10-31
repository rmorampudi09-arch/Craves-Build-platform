package in.craves.advanced.taxonomy;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TaxonomyDtos {
    static final String CODE = "[a-z][a-z0-9-]{1,39}";

    private TaxonomyDtos() { }

    public enum Kind { CUISINE, DIET }

    public enum Status { ACTIVE, RETIRED }

    /** A live vocabulary entry. Cuisines come in tree order (each region followed by its own cuisines); parentCode links them. */
    public record TaxonomyTerm(String code, Kind kind, String parentCode, String name, String description) { }

    public record TaxonomyVocabulary(List<TaxonomyTerm> cuisines, List<TaxonomyTerm> diets, String disclaimer) { }

    /** label is the text that was asked about; code is null when no live term matches it. */
    public record LabelResolution(String label, String code, Kind kind, String name) { }

    public record TermRef(String code, String name) { }

    /** declaredBy: CHEF (the chef's own labels) or STAFF (corrected by Craves staff). The first cuisine is the main one. */
    public record DishTags(UUID menuItemId, List<TermRef> cuisines, List<TermRef> diets, String declaredBy, Instant updatedAt) { }

    public record ChefTagsView(UUID menuItemId, long version, List<String> cuisines, List<String> diets, String declaredBy,
                               Instant updatedAt) { }

    public record TagRequest(@NotEmpty @Size(max = 3) List<@NotNull @Pattern(regexp = CODE) String> cuisines,
                             @Size(max = 6) List<@NotNull @Pattern(regexp = CODE) String> diets) { }

    public record StaffTagRequest(@NotEmpty @Size(max = 3) List<@NotNull @Pattern(regexp = CODE) String> cuisines,
                                  @Size(max = 6) List<@NotNull @Pattern(regexp = CODE) String> diets,
                                  @NotNull Long expectedVersion,
                                  @NotBlank @Size(max = 300) String note) { }

    public record DishTagsLookup(@NotEmpty @Size(max = 100) List<@NotNull UUID> menuItemIds) { }

    public record DishBrowsePage(List<UUID> menuItemIds, String nextCursor) { }

    /** Staff view of a term, retired ones included. */
    public record AdminTerm(String code, Kind kind, String parentCode, String name, String description, List<String> aliases,
                            int sortOrder, Status status, long version, Instant updatedAt) { }

    public record NewTerm(@NotNull @Pattern(regexp = CODE) String code,
                          @NotNull Kind kind,
                          @Pattern(regexp = CODE) String parentCode,
                          @NotBlank @Size(max = 60) String name,
                          @Size(max = 300) String description,
                          @Size(max = 10) List<@NotBlank @Size(max = 40) String> aliases,
                          @Min(0) @Max(10000) Integer sortOrder) { }

    /** Replaces every editable field; code and kind never change. */
    public record TermChange(@Pattern(regexp = CODE) String parentCode,
                             @NotBlank @Size(max = 60) String name,
                             @Size(max = 300) String description,
                             @Size(max = 10) List<@NotBlank @Size(max = 40) String> aliases,
                             @NotNull @Min(0) @Max(10000) Integer sortOrder,
                             @NotNull Status status,
                             @NotNull Long expectedVersion) { }
}
