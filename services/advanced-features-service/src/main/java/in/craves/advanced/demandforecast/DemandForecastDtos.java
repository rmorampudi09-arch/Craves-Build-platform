package in.craves.advanced.demandforecast;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class DemandForecastDtos {
    private DemandForecastDtos() { }

    /**
     * averagePortions: mean portions ordered on the same weekday over the weeks counted (weeks with none count as 0), one decimal;
     * low and high: the fewest and most in any of those weeks. A guide for the chef, not a promise.
     */
    public record DishForecast(UUID menuItemId, String name, double averagePortions, int low, int high) { }

    /** basedOnWeeks: how many past same-weekdays were counted (up to 8; fewer for a new kitchen). complete=false: history was cut short. */
    public record DemandForecast(LocalDate date, int basedOnWeeks, List<LocalDate> weeksCounted, boolean complete, double averageOrders,
                                 List<DishForecast> dishes) { }
}
