package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.dispatch.FleetReplay.Order;
import in.craves.integration.fleet.dispatch.FleetReplay.Report;
import in.craves.integration.fleet.dispatch.FleetReplay.Row;
import in.craves.integration.fleet.dispatch.FleetReplay.Settings;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The replay's shadow decisions, money and break-even line on hand-made orders (no database). */
class FleetReplayTest {
    // The seeded draft card: ₹40 base for 2 km of drop, ₹9 a drop km after, ₹9 a pickup km after 1 km.
    static final RateCard CARD = new RateCard("2026-10-v1", true, Instant.parse("2026-11-03T18:30:00Z"), 4000, 2000, 900, 1000, 900,
        8, 150, 8000, Map.of(), Map.of(), null, 2000, 900, 10);
    // Radius 5 km, detour 130%, overhead ₹5, cost-guard premium ₹10.
    static final DispatchPolicy POLICY = new DispatchPolicy("2026-10-v1", Instant.parse("2026-11-03T18:30:00Z"), "off", 40, 60, 5000);
    static final double DROP_LAT = KITCHEN_LAT + Math.toDegrees(3000.0 / 6_371_000); // 3 km north: 3.9 km by road, ₹40 + ₹17.10
    static final LocalDate DAY = LocalDate.parse("2026-10-19");

    static Settings settings(double acceptRate) {
        return new Settings(DAY, DAY, KITCHEN_LAT, KITCHEN_LNG, 0.2, 2, FleetReplay.parseHours("11-15"), acceptRate, 4000, 7);
    }

    static Order order(String istTime, Long quotePaise) {
        Instant at = LocalDateTime.parse("2026-10-19T" + istTime).atZone(FleetReplay.IST).toInstant();
        return new Order(UUID.randomUUID(), at, "Madhapur", KITCHEN_LAT, KITCHEN_LNG, DROP_LAT, KITCHEN_LNG, quotePaise,
            quotePaise == null ? null : "borzo", quotePaise);
    }

    final List<Order> orders = List.of(order("12:00", 10_000L), order("12:01", 3_000L), order("12:02", 10_000L), order("12:03", 10_000L),
        order("03:00", 10_000L), order("12:30", null));

    @Test
    void ridersTakeWhatTheCostGuardAllowsUntilTheyAreBusyAndOnlyOnShift() {
        Report report = FleetReplay.run(orders, CARD, POLICY, settings(1.0));
        List<Row> rows = report.rows();

        assertThat(rows).extracting(row -> row.order().at().atZone(FleetReplay.IST).toLocalTime().toString())
            .containsExactly("03:00", "12:00", "12:01", "12:02", "12:03", "12:30");
        assertThat(rows).extracting(Row::outcome).containsExactly("NO_RIDERS", "OFFERED", "COST_GUARD", "OFFERED", "NO_RIDERS", "OFFERED");
        assertThat(rows.get(1).riderPayPaise()).as("₹40 base + 1.9 km x ₹9; the rider is at the kitchen").isEqualTo(5710);
        assertThat(rows.get(1).fleetCostPaise()).isEqualTo(6210);
        assertThat(rows.get(1).dropDistanceM()).isBetween(3890, 3910);
        assertThat(rows.get(2).costGuardPassed()).as("₹62.10 against ₹30 + ₹10").isFalse();
        assertThat(rows.get(2).eligibleRiders()).as("the first rider is on the 12:00 trip").isEqualTo(1);
        assertThat(rows.get(4).eligibleRiders()).isZero();
        assertThat(rows.get(5).costGuardPassed()).as("no 3PL price: riders may go").isTrue();
        assertThat(rows.get(5).riderPayPaise()).as("riders wait at the last drop, 3 km away").isGreaterThan(8000);

        assertThat(report.paidRiderHours()).isEqualTo(8.0);
        assertThat(report.pEffPaise()).isEqualTo(10_000.0);
        double v = (6210 + 6210 + rows.get(5).fleetCostPaise()) / 3.0;
        assertThat(report.vPaise()).isCloseTo(v, within(0.001));
        assertThat(report.breakEvenOrdersPerRiderHour()).isCloseTo(4000 / (10_000 - v), within(0.0001));
        assertThat(report.ordersPerRiderHour()).isEqualTo(3 / 8.0);
    }

    @Test
    void declinedOffersAreCountedAndCostNothing() {
        Report report = FleetReplay.run(orders, CARD, POLICY, settings(0.0));
        assertThat(report.rows()).extracting(Row::outcome).containsExactly("NO_RIDERS", "DECLINED", "COST_GUARD", "DECLINED", "DECLINED", "DECLINED");
        assertThat(report.vPaise()).isNull();
        assertThat(report.breakEvenOrdersPerRiderHour()).isNull();
        assertThat(FleetReplay.markdown(report)).contains("| u* (break-even orders per paid rider-hour) | none");
    }

    @Test
    void theReportAndTheCsvCarryEveryOrder() {
        Report report = FleetReplay.run(orders, CARD, POLICY, settings(1.0));
        String csv = FleetReplay.csv(report);
        assertThat(csv.lines()).hasSize(orders.size() + 1);
        assertThat(csv.lines().findFirst().orElseThrow()).startsWith("chef_sub_order_id,dispatch_at_ist,area,drop_distance_m,eligible_riders,"
            + "fleet_eligible,outcome,cost_guard");
        assertThat(csv).contains(",OFFERED,PASS,").contains(",COST_GUARD,FAIL,").contains(",NO_RIDERS,,");
        String markdown = FleetReplay.markdown(report);
        assertThat(markdown).contains("# Fleet replay 2026-10-19 to 2026-10-19", "| OFFERED | 3 |", "| COST_GUARD | 1 |", "| NO_RIDERS | 2 |",
            "| Paid rider-hours x C_h | 8.0 h x ₹40.00 = ₹320.00 |", "| P_eff | ₹100.00 |", "Nothing was offered, pushed or booked.");
        assertThat(FleetReplay.rupees(-12_345)).isEqualTo("-₹123.45");
    }

    @Test
    void shiftHoursAreIstRangesAndRefuseNonsense() {
        assertThat(FleetReplay.parseHours("11-15, 19-23")).hasSize(2);
        assertThat(FleetReplay.onShift(LocalDateTime.parse("2026-10-19T14:59").atZone(FleetReplay.IST).toInstant(), FleetReplay.parseHours("11-15")))
            .isTrue();
        assertThat(FleetReplay.onShift(LocalDateTime.parse("2026-10-19T15:00").atZone(FleetReplay.IST).toInstant(), FleetReplay.parseHours("11-15")))
            .isFalse();
        assertThatThrownBy(() -> FleetReplay.parseHours("15-11")).isInstanceOf(IllegalArgumentException.class);
    }
}
