package in.craves.advanced.demandforecast;

import in.craves.advanced.demandforecast.DemandForecastDtos.DemandForecast;
import in.craves.advanced.demandforecast.DemandForecastDtos.DishForecast;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

final class DemandForecastRules {
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    static final int WEEKS = 8;
    /** Orders that never turned into cooking: not demand the kitchen served. Rejected ones were wanted, so they count. */
    static final Set<String> NOT_DEMAND = Set.of("PAYMENT_PENDING", "CANCELLED");

    private DemandForecastRules() { }

    /** The 8 most recent days before today (India) on the same weekday as {@code date}, newest first. */
    static List<LocalDate> sameWeekdays(LocalDate date, LocalDate today) {
        List<LocalDate> weeks = new ArrayList<>();
        for (LocalDate day = date.minusWeeks(1); weeks.size() < WEEKS; day = day.minusWeeks(1)) {
            if (day.isBefore(today)) weeks.add(day);
        }
        return weeks;
    }

    /**
     * Counts only weeks on or after the kitchen's first order seen, so a new kitchen is not averaged with weeks it did not exist.
     * When the read was cut short (not complete), the day of the oldest order read may be partial, so only later days count.
     */
    static DemandForecast forecast(List<Order> orders, LocalDate date, LocalDate today, boolean complete) {
        LocalDate first = orders.stream().filter(o -> o.createdAt() != null).map(o -> o.createdAt().atZone(INDIA).toLocalDate())
                .min(Comparator.naturalOrder()).orElse(null);
        List<LocalDate> weeks = first == null ? List.of()
                : sameWeekdays(date, today).stream().filter(day -> complete ? !day.isBefore(first) : day.isAfter(first)).toList();
        Map<LocalDate, Integer> index = new HashMap<>();
        for (int i = 0; i < weeks.size(); i++) index.put(weeks.get(i), i);
        int[] ordersPerWeek = new int[weeks.size()];
        Map<UUID, int[]> portions = new HashMap<>();
        Map<UUID, String> names = new HashMap<>();
        for (Order order : orders) {
            if (order.createdAt() == null || NOT_DEMAND.contains(order.status())) continue;
            Integer week = index.get(order.createdAt().atZone(INDIA).toLocalDate());
            if (week == null) continue;
            ordersPerWeek[week]++;
            for (OrderLine line : order.lines()) {
                if (line.menuItemId() == null) continue;
                portions.computeIfAbsent(line.menuItemId(), id -> new int[weeks.size()])[week] += line.quantity();
                names.putIfAbsent(line.menuItemId(), line.name());
            }
        }
        List<DishForecast> dishes = portions.entrySet().stream().map(entry -> {
            int[] perWeek = entry.getValue();
            int low = Integer.MAX_VALUE, high = 0, sum = 0;
            for (int count : perWeek) {
                low = Math.min(low, count);
                high = Math.max(high, count);
                sum += count;
            }
            return new DishForecast(entry.getKey(), names.get(entry.getKey()), average(sum, perWeek.length), low, high);
        }).sorted(Comparator.comparingDouble(DishForecast::averagePortions).reversed().thenComparing(d -> d.menuItemId().toString())).toList();
        int totalOrders = 0;
        for (int count : ordersPerWeek) totalOrders += count;
        return new DemandForecast(date, weeks.size(), weeks, complete, weeks.isEmpty() ? 0 : average(totalOrders, weeks.size()), dishes);
    }

    static double average(int sum, int count) {
        return BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(count), 1, RoundingMode.HALF_UP).doubleValue();
    }
}
