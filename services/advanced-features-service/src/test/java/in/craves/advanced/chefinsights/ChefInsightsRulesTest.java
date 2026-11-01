package in.craves.advanced.chefinsights;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.chefinsights.ChefInsightsDtos.ChefInsightsSummary;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ChefInsightsRulesTest {
    static final UUID KITCHEN = UUID.randomUUID();
    static final UUID DAL = UUID.randomUUID();
    static final UUID ROTI = UUID.randomUUID();

    static Order order(UUID customer, String status, Instant at, OrderLine... lines) {
        return new Order(UUID.randomUUID(), customer, KITCHEN, status, List.of(lines), null, at, at);
    }

    static OrderLine line(UUID item, String name, long price, int quantity) {
        return new OrderLine(UUID.randomUUID(), item, name, price, quantity);
    }

    @Test
    void countsPaidOrdersOnIndiaDatesAndSalesOfDeliveredOnes() {
        UUID asha = UUID.randomUUID();
        UUID ravi = UUID.randomUUID();
        // 2026-10-30T19:00Z is 31 Oct 00:30 IST: it belongs to the 31st.
        Instant lateNight = Instant.parse("2026-10-30T19:00:00Z");
        Instant noon = Instant.parse("2026-10-31T06:30:00Z");
        List<Order> orders = List.of(
                order(asha, "DELIVERED", lateNight, line(DAL, "Dal", 15000, 2), line(ROTI, "Roti", 2000, 4)),
                order(asha, "DELIVERED", noon, line(ROTI, "Roti", 2000, 6)),
                order(ravi, "CHEF_REJECTED", noon, line(DAL, "Dal", 15000, 1)),
                order(ravi, "REFUNDED", noon, line(DAL, "Dal", 15000, 1)),
                order(ravi, "CHEF_ACCEPTED", noon, line(DAL, "Dal", 15000, 1)),
                order(ravi, "PAYMENT_PENDING", noon, line(DAL, "Dal", 15000, 9)),
                order(ravi, "CANCELLED", noon, line(DAL, "Dal", 15000, 9)),
                order(ravi, "DELIVERED", Instant.parse("2026-10-30T18:00:00Z"), line(DAL, "Dal", 15000, 9)));
        ChefInsightsSummary summary = ChefInsightsRules.summarize(orders, LocalDate.of(2026, 10, 31), LocalDate.of(2026, 10, 31), true);
        assertThat(summary.totals().orders()).isEqualTo(5);
        assertThat(summary.totals().delivered()).isEqualTo(2);
        assertThat(summary.totals().rejected()).isEqualTo(1);
        assertThat(summary.totals().refunded()).isEqualTo(1);
        assertThat(summary.totals().inProgress()).isEqualTo(1);
        assertThat(summary.totals().deliveredFoodPaise()).isEqualTo(30000 + 8000 + 12000);
        assertThat(summary.totals().uniqueCustomers()).isEqualTo(2);
        assertThat(summary.totals().repeatCustomers()).isEqualTo(2);
        assertThat(summary.days()).singleElement().satisfies(day -> {
            assertThat(day.day()).isEqualTo(LocalDate.of(2026, 10, 31));
            assertThat(day.delivered()).isEqualTo(2);
        });
        assertThat(summary.topDishes()).extracting(d -> d.name() + ":" + d.deliveredQuantity()).containsExactly("Roti:10", "Dal:2");
        assertThat(summary.ordersByHour()).hasSize(24);
        assertThat(summary.ordersByHour().get(0)).isEqualTo(1);
        assertThat(summary.ordersByHour().get(12)).isEqualTo(4);
    }
}
