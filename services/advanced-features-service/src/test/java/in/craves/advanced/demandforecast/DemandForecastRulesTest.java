package in.craves.advanced.demandforecast;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.demandforecast.DemandForecastDtos.DemandForecast;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DemandForecastRulesTest {
    static final LocalDate TODAY = LocalDate.of(2026, 10, 31); // a Saturday
    static final UUID DAL = UUID.randomUUID();
    static final UUID ROTI = UUID.randomUUID();

    static Order on(LocalDate day, String status, UUID item, String name, int quantity) {
        var at = day.atTime(LocalTime.NOON).atZone(DemandForecastRules.INDIA).toInstant();
        return new Order(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), status,
                List.of(new OrderLine(UUID.randomUUID(), item, name, 10000, quantity)), null, at, at);
    }

    @Test
    void weekdaysAreTheEightMostRecentBeforeToday() {
        assertThat(DemandForecastRules.sameWeekdays(LocalDate.of(2026, 11, 2), TODAY)).hasSize(8)
                .startsWith(LocalDate.of(2026, 10, 26)).endsWith(LocalDate.of(2026, 9, 7));
        // Forecasting today: last week's same day is the newest.
        assertThat(DemandForecastRules.sameWeekdays(TODAY, TODAY).get(0)).isEqualTo(LocalDate.of(2026, 10, 24));
        // Ten days ahead: the same weekday 7 days back is still in the future, so it steps further and still counts 8.
        assertThat(DemandForecastRules.sameWeekdays(TODAY.plusDays(10), TODAY)).hasSize(8).startsWith(LocalDate.of(2026, 10, 27));
    }

    @Test
    void averagesSameWeekdaysCountingQuietWeeksAndSkippingWeeksBeforeTheKitchenStarted() {
        LocalDate monday = LocalDate.of(2026, 11, 2);
        List<Order> orders = new ArrayList<>();
        // The kitchen's first order is four Mondays back; Mondays 1, 2 and 4 weeks back had dal, 3 weeks back none.
        orders.add(on(monday.minusWeeks(1), "DELIVERED", DAL, "Dal", 6));
        orders.add(on(monday.minusWeeks(1), "CHEF_REJECTED", ROTI, "Roti", 2));
        orders.add(on(monday.minusWeeks(2), "DELIVERED", DAL, "Dal", 3));
        orders.add(on(monday.minusWeeks(3), "PAYMENT_PENDING", DAL, "Dal", 50));
        orders.add(on(monday.minusWeeks(4), "DELIVERED", DAL, "Dal", 3));
        orders.add(on(monday.minusWeeks(2).plusDays(1), "DELIVERED", DAL, "Dal", 40)); // a Tuesday
        DemandForecast forecast = DemandForecastRules.forecast(orders, monday, TODAY, true);
        assertThat(forecast.basedOnWeeks()).isEqualTo(4);
        assertThat(forecast.averageOrders()).isEqualTo(1.0);
        assertThat(forecast.dishes()).extracting(d -> d.name() + ":" + d.averagePortions() + ":" + d.low() + "-" + d.high())
                .containsExactly("Dal:3.0:0-6", "Roti:0.5:0-2");
    }

    @Test
    void aCutShortReadDoesNotCountThePartialOldestDay() {
        LocalDate monday = LocalDate.of(2026, 11, 2);
        List<Order> orders = List.of(on(monday.minusWeeks(1), "DELIVERED", DAL, "Dal", 6), on(monday.minusWeeks(2), "DELIVERED", DAL, "Dal", 2));
        assertThat(DemandForecastRules.forecast(orders, monday, TODAY, true).basedOnWeeks()).isEqualTo(2);
        assertThat(DemandForecastRules.forecast(orders, monday, TODAY, false).basedOnWeeks()).isEqualTo(1);
    }

    @Test
    void noHistoryMeansNoForecast() {
        DemandForecast forecast = DemandForecastRules.forecast(List.of(), TODAY, TODAY, true);
        assertThat(forecast.basedOnWeeks()).isZero();
        assertThat(forecast.dishes()).isEmpty();
    }
}
