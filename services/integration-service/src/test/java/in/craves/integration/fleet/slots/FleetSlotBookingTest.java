package in.craves.integration.fleet.slots;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.slots.FleetSlotBookingService.Cluster;
import in.craves.integration.fleet.slots.FleetSlotBookingService.OrderPoint;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** App 1.3.3 (R-07): the slot rules that need no database. */
class FleetSlotBookingTest {
    /** Inside the 17.44 to 17.45 cell with room for the 0.002 spread the orders get. */
    static final double LAT = 17.4450;
    static final double LNG = 78.3915;

    /** perDay orders in the cell at (lat, lng) at the given IST hour, each day over days days. */
    static List<OrderPoint> orders(double lat, double lng, int hour, int days, int perDay, String area) {
        List<OrderPoint> list = new ArrayList<>();
        for (int day = 0; day < days; day++) {
            for (int i = 0; i < perDay; i++) {
                Instant at = LocalDate.of(2026, 11, 1).plusDays(day).atTime(hour, i % 60).atZone(FleetSlotBookingService.IST).toInstant();
                list.add(new OrderPoint(at, lat + 0.001 * (i % 3), lng + 0.001 * (i % 2), area));
            }
        }
        return list;
    }

    @Test
    void cellsWithTwoOrdersAnHourAtLunchOrDinnerJoinTheirNeighboursIntoAClusterNamedForTheirArea() {
        List<OrderPoint> orders = new ArrayList<>();
        orders.addAll(orders(LAT, LNG, 12, 14, 9, "Madhapur"));            // 126 lunch orders over 56 window hours: 2.25 an hour
        orders.addAll(orders(LAT, LNG + 0.01, 20, 14, 9, "Madhapur"));     // the cell to the east, at dinner
        orders.addAll(orders(LAT + 0.05, LNG, 12, 14, 1, "Kondapur"));     // 5 km north: 0.25 an hour, not a cluster
        orders.addAll(orders(LAT, LNG, 16, 14, 9, "Madhapur"));            // 16:00 is neither lunch nor dinner
        List<Cluster> clusters = FleetSlotBookingService.clusters(orders, 14);
        assertThat(clusters).hasSize(1);
        Cluster cluster = clusters.get(0);
        assertThat(cluster.cells()).hasSize(2);
        assertThat(cluster.area()).isEqualTo("Madhapur");
        assertThat(cluster.lunchPerHour()).isEqualTo(2.25);
        assertThat(cluster.dinnerPerHour()).isEqualTo(2.25);
        assertThat(cluster.lat()).isBetween(LAT, LAT + 0.003);
        assertThat(cluster.lng()).isBetween(LNG, LNG + 0.012);
        assertThat(FleetSlotBookingService.clusters(List.of(), 14)).isEmpty();
    }

    @Test
    void placesFollowExpectedOrdersAndTheRateStaysInsideTheCardAndSixtyToOneFifty() {
        assertThat(FleetSlotBookingService.places(2.25)).isEqualTo(2);
        assertThat(FleetSlotBookingService.places(2.8)).isEqualTo(2);
        assertThat(FleetSlotBookingService.places(2.81)).isEqualTo(3);
        assertThat(FleetSlotBookingService.places(0)).isZero();
        assertThat(FleetSlotBookingService.rate(List.of(0L, 15000L))).isEqualTo(9000);
        assertThat(FleetSlotBookingService.rate(null)).isEqualTo(9000);
        assertThat(FleetSlotBookingService.rate(List.of(10000L, 15000L))).as("the card's floor wins").isEqualTo(10000);
        assertThat(FleetSlotBookingService.rate(List.of(0L, 7000L))).as("the card's ceiling wins").isEqualTo(7000);
        assertThat(FleetSlotBookingService.rate(List.of(0L, 5000L))).as("a card under ₹60: its ceiling").isEqualTo(5000);
    }

    @Test
    void wavesOpenThursdayTenForRidersWhoCompletedASlotAndFridayTenForEveryone() {
        Instant slot = ZonedDateTime.of(2026, 11, 18, 19, 0, 0, 0, FleetSlotBookingService.IST).toInstant(); // a Wednesday
        assertThat(FleetSlotBookingService.waveOpens(slot, true))
            .isEqualTo(ZonedDateTime.of(2026, 11, 12, 10, 0, 0, 0, FleetSlotBookingService.IST).toInstant());
        assertThat(FleetSlotBookingService.waveOpens(slot, false))
            .isEqualTo(ZonedDateTime.of(2026, 11, 13, 10, 0, 0, 0, FleetSlotBookingService.IST).toInstant());
        Instant monday = ZonedDateTime.of(2026, 11, 16, 11, 30, 0, 0, FleetSlotBookingService.IST).toInstant();
        assertThat(FleetSlotBookingService.waveOpens(monday, false)).as("Monday's slots open the Friday before")
            .isEqualTo(ZonedDateTime.of(2026, 11, 13, 10, 0, 0, 0, FleetSlotBookingService.IST).toInstant());
    }

    @Test
    void metresAreHaversine() {
        assertThat(FleetSlotBookingService.metres(LAT, LNG, LAT, LNG)).isZero();
        assertThat(FleetSlotBookingService.metres(0, 0, 1, 0)).isBetween(111_100.0, 111_300.0);
    }
}
