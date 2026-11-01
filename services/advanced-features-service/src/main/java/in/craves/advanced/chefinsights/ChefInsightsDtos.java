package in.craves.advanced.chefinsights;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ChefInsightsDtos {
    private ChefInsightsDtos() { }

    /**
     * Paid orders only (payment pending and cancelled-before-payment are left out). Money is the food at the order lines' own
     * prices (before platform fee, tax, delivery and discounts) for delivered orders: what the kitchen sold, not its payout (E34 ledger).
     */
    public record ChefInsightsTotals(int orders, int delivered, int rejected, int refunded, int inProgress, long deliveredFoodPaise,
                                     int uniqueCustomers, int repeatCustomers) { }

    public record ChefInsightsDay(LocalDate day, int orders, int delivered, long deliveredFoodPaise) { }

    public record ChefInsightsDish(UUID menuItemId, String name, int deliveredQuantity, long deliveredFoodPaise) { }

    /** orders placed in each India hour of the day (index 0 = 00:00–00:59 IST). */
    public record ChefInsightsSummary(LocalDate from, LocalDate to, boolean complete, ChefInsightsTotals totals, List<ChefInsightsDay> days,
                                      List<ChefInsightsDish> topDishes, List<Integer> ordersByHour) { }
}
