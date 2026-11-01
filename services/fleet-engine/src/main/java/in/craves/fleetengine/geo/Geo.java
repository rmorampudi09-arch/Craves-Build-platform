package in.craves.fleetengine.geo;

/**
 * The distances dispatch uses, written exactly as integration-service writes them (RoadDistanceClient.straightLineMetres,
 * FleetPay.pickupDistanceM, FleetDispatcher.homeNearerM and nearbyRiders' box), so the engine ranks riders as the Java
 * dispatcher does, to the bit. GeoTest pins the results integration-service returns for the same points.
 */
public final class Geo {
    /** FleetDispatcher.HOME_PROGRESS_M and HOME_DETOUR_M (heading home, Phase 5). */
    public static final int HOME_PROGRESS_M = 500;
    public static final int HOME_DETOUR_M = 2_000;

    private Geo() {
    }

    /** RoadDistanceClient.straightLineMetres: haversine on a 6,371 km sphere. */
    public static double straightLineMetres(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.pow(Math.sin(dLat / 2), 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    /** FleetPay.pickupDistanceM: the straight line times the policy's detour, as offers show it. */
    public static int pickupDistanceM(double straightLineM, int detourPercent) {
        return (int) Math.round(straightLineM * detourPercent / 100.0);
    }

    /**
     * FleetDispatcher.homeNearerM: how many metres nearer home the drop leaves the rider, or null when the order doesn't
     * take them home (less than 500 m nearer, or more than max(2 km, a quarter of the way home) added).
     */
    public static Integer homeNearerM(double riderLat, double riderLng, double kitchenLat, double kitchenLng, double dropLat,
                                      double dropLng, double homeLat, double homeLng) {
        double riderHome = straightLineMetres(riderLat, riderLng, homeLat, homeLng);
        double dropHome = straightLineMetres(dropLat, dropLng, homeLat, homeLng);
        if (dropHome > riderHome - HOME_PROGRESS_M) {
            return null;
        }
        double added = straightLineMetres(riderLat, riderLng, kitchenLat, kitchenLng)
            + straightLineMetres(kitchenLat, kitchenLng, dropLat, dropLng) + dropHome - riderHome;
        return added > Math.max(HOME_DETOUR_M, riderHome / 4) ? null : (int) Math.round(riderHome - dropHome);
    }

    /**
     * nearbyRiders' bounding box around a kitchen, {minLat, minLng, maxLat, maxLng}: radius / 111,320 m a degree of
     * latitude, and of longitude at the kitchen's latitude (never under 0.01 of a degree's length).
     */
    public static double[] box(double lat, double lng, int radiusM) {
        double dLat = radiusM / 111_320.0;
        double dLng = radiusM / (111_320.0 * Math.max(0.01, Math.cos(Math.toRadians(lat))));
        return new double[] {lat - dLat, lng - dLng, lat + dLat, lng + dLng};
    }
}
