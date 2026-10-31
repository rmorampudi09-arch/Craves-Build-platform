package in.craves.advanced.tastememory;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TasteMemoryDtos {
    private TasteMemoryDtos() { }

    /** Same words as Catalog's dish spice level. */
    public enum Spice { MILD, MEDIUM, SPICY }

    public enum Oil { LESS, REGULAR }

    /** Null fields: nothing remembered for that choice. note is the person's own words for the chef (for example "less salt"). */
    public record TasteProfileRequest(Spice spice, Oil oil, @Size(max = 200) String note) { }

    public record TasteProfile(Spice spice, Oil oil, String note, Instant updatedAt) { }

    /** choiceIds are the dish's option choices (menu-options) picked last time; stale ones are simply ignored by the apps. */
    public record RememberedDishRequest(@Size(max = 50) List<@NotNull UUID> choiceIds, Spice spice, Oil oil, @Size(max = 200) String note) { }

    public record RememberedDish(UUID menuItemId, List<UUID> choiceIds, Spice spice, Oil oil, String note, Instant updatedAt) { }

    public record RememberedDishPage(List<RememberedDish> items, String nextCursor) { }

    public record RememberedDishLookup(@NotEmpty @Size(max = 100) List<@NotNull UUID> menuItemIds) { }
}
