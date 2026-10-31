package in.craves.advanced.menuoptions;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class MenuOptionsDtos {
    private MenuOptionsDtos() { }

    public enum MealPeriod { BREAKFAST, LUNCH, SNACKS, DINNER, LATE_NIGHT }

    /** One pick inside a group. id is kept across edits (send it back); new choices get one. Price is added to the dish price. */
    public record OptionChoice(UUID id,
                               @NotBlank @Size(max = 40) String name,
                               @NotNull @Min(0) @Max(1_000_000) Long priceDeltaPaise,
                               Boolean available) { }

    /** A group such as "Rice" (choose exactly 1) or "Add-ons" (choose up to 3). */
    public record OptionGroup(UUID id,
                              @NotBlank @Size(max = 40) String name,
                              @NotNull @Min(0) @Max(20) Integer minSelect,
                              @NotNull @Min(1) @Max(20) Integer maxSelect,
                              @NotEmpty @Size(max = 20) List<@Valid @NotNull OptionChoice> choices) { }

    /** mealPeriods empty: the dish is served whenever the kitchen is open. */
    public record DishOptionsRequest(@Size(max = 10) List<@Valid @NotNull OptionGroup> groups,
                                     @Size(max = 5) Set<@NotNull MealPeriod> mealPeriods) { }

    public record DishOptions(UUID menuItemId, UUID kitchenId, List<OptionGroup> groups, List<MealPeriod> mealPeriods, long version,
                              Instant updatedAt) { }

    public record DishOptionsLookup(@NotEmpty @Size(max = 100) List<@NotNull UUID> menuItemIds) { }

    /** India time. endsAt earlier than startsAt means the window runs past midnight. days null: every day. */
    public record MealPeriodWindow(@NotNull MealPeriod period, @NotNull LocalTime startsAt, @NotNull LocalTime endsAt,
                                   @Size(min = 1, max = 7) Set<@NotNull DayOfWeek> days) { }

    public record MealPeriodsRequest(@NotNull @Size(max = 5) List<@Valid @NotNull MealPeriodWindow> periods) { }

    public record KitchenMealPeriods(UUID kitchenId, String timeZone, List<MealPeriodWindow> periods, List<MealPeriod> servingNow) { }

    /** at: when the food is wanted (default now); the dish must be served then if it has meal periods. */
    public record PriceQuoteRequest(@NotNull UUID menuItemId,
                                    @NotNull @Min(1) @Max(100) Integer quantity,
                                    @Size(max = 50) List<@NotNull UUID> choiceIds,
                                    Instant at) { }

    public record QuotedChoice(UUID groupId, String groupName, UUID choiceId, String choiceName, long priceDeltaPaise) { }

    public record PriceQuote(UUID menuItemId, long basePricePaise, List<QuotedChoice> choices, long unitPricePaise, int quantity,
                             long totalPaise, long optionsVersion, MealPeriod mealPeriod) { }
}
