package in.craves.advanced.chefinsights;

import in.craves.advanced.chefinsights.ChefInsightsDtos.ChefInsightsDay;
import in.craves.advanced.chefinsights.ChefInsightsDtos.ChefInsightsDish;
import in.craves.advanced.chefinsights.ChefInsightsDtos.ChefInsightsSummary;
import in.craves.advanced.chefinsights.ChefInsightsDtos.ChefInsightsTotals;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

final class ChefInsightsRules {
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    static final int TOP_DISHES = 10;
    /** Never paid: these are not sales. */
    static final Set<String> UNPAID = Set.of("PAYMENT_PENDING", "CANCELLED");
    static final Set<String> REFUNDED = Set.of("REFUND_PENDING", "REFUNDED", "REFUND_FAILED");

    private ChefInsightsRules() { }

    private record DishTotal(String name, int quantity, long paise) { }

    /** Orders placed on India dates from..to (both included); others are ignored. */
    static ChefInsightsSummary summarize(List<Order> orders, LocalDate from, LocalDate to, boolean complete) {
        int all = 0, delivered = 0, rejected = 0, refunded = 0, inProgress = 0;
        long deliveredPaise = 0;
        Map<UUID, Integer> perCustomer = new HashMap<>();
        Map<LocalDate, long[]> days = new TreeMap<>();
        Map<UUID, DishTotal> dishes = new HashMap<>();
        int[] hours = new int[24];
        for (Order order : orders) {
            if (order.createdAt() == null || UNPAID.contains(order.status())) continue;
            ZonedDateTime placed = order.createdAt().atZone(INDIA);
            LocalDate day = placed.toLocalDate();
            if (day.isBefore(from) || day.isAfter(to)) continue;
            all++;
            hours[placed.getHour()]++;
            perCustomer.merge(order.customerId(), 1, Integer::sum);
            long[] daily = days.computeIfAbsent(day, d -> new long[3]);
            daily[0]++;
            switch (order.status()) {
                case "DELIVERED" -> {
                    delivered++;
                    long food = 0;
                    for (OrderLine line : order.lines()) {
                        long paise = line.unitPricePaise() * line.quantity();
                        food += paise;
                        if (line.menuItemId() != null) {
                            dishes.merge(line.menuItemId(), new DishTotal(line.name(), line.quantity(), paise),
                                    (a, b) -> new DishTotal(a.name(), a.quantity() + b.quantity(), a.paise() + b.paise()));
                        }
                    }
                    deliveredPaise += food;
                    daily[1]++;
                    daily[2] += food;
                }
                case "CHEF_REJECTED" -> rejected++;
                default -> {
                    if (REFUNDED.contains(order.status())) refunded++;
                    else inProgress++;
                }
            }
        }
        List<ChefInsightsDay> dayList = new ArrayList<>();
        days.forEach((day, d) -> dayList.add(new ChefInsightsDay(day, (int) d[0], (int) d[1], d[2])));
        List<ChefInsightsDish> top = dishes.entrySet().stream()
                .map(e -> new ChefInsightsDish(e.getKey(), e.getValue().name(), e.getValue().quantity(), e.getValue().paise()))
                .sorted(Comparator.comparingInt(ChefInsightsDish::deliveredQuantity).reversed()
                        .thenComparing(Comparator.comparingLong(ChefInsightsDish::deliveredFoodPaise).reversed())
                        .thenComparing(dish -> dish.menuItemId().toString()))
                .limit(TOP_DISHES).toList();
        int repeat = (int) perCustomer.values().stream().filter(count -> count > 1).count();
        List<Integer> byHour = new ArrayList<>();
        for (int count : hours) byHour.add(count);
        return new ChefInsightsSummary(from, to, complete,
                new ChefInsightsTotals(all, delivered, rejected, refunded, inProgress, deliveredPaise, perCustomer.size(), repeat),
                List.copyOf(dayList), top, List.copyOf(byHour));
    }
}
