package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Phase 5: which orders count as taking a rider home (FleetDispatcher.homeNearerM, straight lines): the drop must leave them
 * at least 500 m nearer home, and the trip may add at most 2 km, or a quarter of the way home, to riding straight home.
 */
class FleetHeadingHomeTest {
    // The Madhapur kitchen of the dispatch fixtures and its Kondapur drop, about 3.6 km to the north-west.
    static final double DROP_LAT = 17.4600;
    static final double DROP_LNG = 78.3600;

    @Test
    void anOrderWhoseDropLiesOnTheWayHomeCounts() {
        Integer nearer = FleetDispatcher.homeNearerM(KITCHEN_LAT + 0.003, KITCHEN_LNG, KITCHEN_LAT, KITCHEN_LNG, DROP_LAT, DROP_LNG, 17.47, 78.35);
        assertThat(nearer).as("about 4.9 km from home before, about 1.5 km after").isBetween(3_200, 3_500);
    }

    @Test
    void anOrderTheOtherWayDoesNot() {
        assertThat(FleetDispatcher.homeNearerM(KITCHEN_LAT + 0.003, KITCHEN_LNG, KITCHEN_LAT, KITCHEN_LNG, DROP_LAT, DROP_LNG, 17.43, 78.42))
            .isNull();
    }

    @Test
    void aDropThatLeavesTheRiderBarelyNearerDoesNot() {
        // Home 2 km due north of a rider at the drop's latitude: a drop 300 m nearer home is not progress enough.
        double riderLat = 17.4600;
        double homeLat = riderLat + 0.018;
        assertThat(FleetDispatcher.homeNearerM(riderLat, DROP_LNG, riderLat, DROP_LNG, riderLat + 0.0027, DROP_LNG, homeLat, DROP_LNG))
            .isNull();
        assertThat(FleetDispatcher.homeNearerM(riderLat, DROP_LNG, riderLat, DROP_LNG, riderLat + 0.0054, DROP_LNG, homeLat, DROP_LNG))
            .as("600 m nearer, at the rider's own kitchen: it counts").isBetween(580, 620);
    }

    @Test
    void anOrderFarOutOfTheWayDoesNotEvenIfItsDropIsNearHome() {
        // The rider is already 1.5 km from home and the kitchen is 3.6 km the other way: the trip adds about 7 km.
        assertThat(FleetDispatcher.homeNearerM(DROP_LAT, DROP_LNG, KITCHEN_LAT, KITCHEN_LNG, 17.465, 78.355, 17.47, 78.35)).isNull();
    }
}
