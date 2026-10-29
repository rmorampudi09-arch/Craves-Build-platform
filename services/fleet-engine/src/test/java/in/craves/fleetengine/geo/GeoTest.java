package in.craves.fleetengine.geo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * The expected bits are what integration-service's RoadDistanceClient.straightLineMetres returned for the same points on
 * Java 21 (28 Oct 2026): the engine and FleetDispatcher must rank riders identically, so they must agree to the bit.
 */
class GeoTest {
    @Test
    void straightLineMatchesIntegrationServiceBitForBit() {
        double[][] points = {
            {17.4483, 78.3915, 17.4486, 78.3908}, {17.4483, 78.3915, 17.46, 78.36}, {17.4483, 78.3915, 17.4483, 78.3915},
            {17.385, 78.4867, 17.4401, 78.3489}, {12.9716, 77.5946, 13.0827, 80.2707}, {17.4483, 78.3915, 17.4934, 78.3915},
            {17.4483, 78.3915, 17.4483, 78.4385}, {-33.8688, 151.2093, 51.5074, -0.1278}};
        long[] bits = {0x405459d8d94598e2L, 0x40ac036a39c0b9d6L, 0x0L, 0x40cef62d1963e1e3L, 0x4111b5f0198d4b98L, 0x40b396e425232419L,
            0x40b379b1e3138ae6L, 0x417034e8d75b52f4L};
        int[] pickup140 = {114, 5020, 0, 22193, 406241, 7021, 6980, 23791507};
        for (int i = 0; i < points.length; i++) {
            double[] p = points[i];
            double d = Geo.straightLineMetres(p[0], p[1], p[2], p[3]);
            long got = Double.doubleToRawLongBits(d);
            // Across continents the last bit may depend on the CPU's sine; dispatch (a 5 km radius) never meets it.
            assertTrue(Math.abs(got - bits[i]) <= (i == 7 ? 1 : 0), "case " + i + ": " + d + " 0x" + Long.toHexString(got));
            assertEquals(pickup140[i], Geo.pickupDistanceM(d, 140), "pickup at 140%, case " + i);
        }
    }

    @Test
    void homeNearerMatchesIntegrationService() {
        assertEquals(3332, Geo.homeNearerM(17.4513, 78.3915, 17.4483, 78.3915, 17.46, 78.36, 17.47, 78.35));
        assertNull(Geo.homeNearerM(17.4513, 78.3915, 17.4483, 78.3915, 17.46, 78.36, 17.43, 78.42), "the other way");
        assertNull(Geo.homeNearerM(17.46, 78.36, 17.4483, 78.3915, 17.465, 78.355, 17.47, 78.35), "a far detour");
        assertEquals(600, Geo.homeNearerM(17.46, 78.36, 17.46, 78.36, 17.4654, 78.36, 17.478, 78.36));
    }

    @Test
    void boxMatchesNearbyRiders() {
        double[] box = Geo.box(17.4483, 78.3915, 5000);
        assertEquals(Double.longBitsToDouble(0x3fa6ff2c0fd25fdaL), box[2] - 17.4483, 1e-15);
        assertEquals(Double.longBitsToDouble(0x3fa81b1e441047b0L), box[3] - 78.3915, 1e-13);
        assertTrue(box[0] < 17.4483 && box[1] < 78.3915);
    }
}
