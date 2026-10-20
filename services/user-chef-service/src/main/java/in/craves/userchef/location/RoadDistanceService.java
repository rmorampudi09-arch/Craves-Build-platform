package in.craves.userchef.location;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.location.OlaMapsClient.RoadDistance;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Rider drop distance (PLAN F6): Ola road metres cached per kitchen-address pair for 30 days, else straight line x 1.3.
 * Points are rounded to 4 decimals (about 11 m), so GPS-level noise neither misses the cache nor changes pay.
 */
@Service
public class RoadDistanceService {
    static final double FALLBACK_DETOUR_FACTOR = 1.3;
    private static final double EARTH_RADIUS_METERS = 6_371_000;

    private final JdbcTemplate jdbcTemplate;
    private final OlaMapsClient maps;

    public RoadDistanceService(JdbcTemplate jdbcTemplate, OlaMapsClient maps) {
        this.jdbcTemplate = jdbcTemplate;
        this.maps = maps;
    }

    public RoadDistance distance(
        UUID kitchenId, UUID addressId, BigDecimal fromLat, BigDecimal fromLng, BigDecimal toLat, BigDecimal toLng
    ) {
        BigDecimal originLat = round(fromLat);
        BigDecimal originLng = round(fromLng);
        BigDecimal destinationLat = round(toLat);
        BigDecimal destinationLng = round(toLng);
        String originKey = kitchenId != null ? kitchenId.toString() : originLat + "," + originLng;
        String destinationKey = addressId != null ? addressId.toString() : destinationLat + "," + destinationLng;

        // A moved kitchen or edited address no longer matches the stored points, so Ola is asked again.
        List<RoadDistance> cached = jdbcTemplate.query(
            """
                SELECT meters, seconds
                FROM road_distance_cache
                WHERE origin_key = ? AND destination_key = ?
                  AND origin_lat = ? AND origin_lng = ? AND destination_lat = ? AND destination_lng = ?
                  AND fetched_at > now() - INTERVAL '30 days'
                """,
            (rs, row) -> new RoadDistance(rs.getLong("meters"), rs.getObject("seconds", Long.class), "CACHE"),
            originKey, destinationKey, originLat, originLng, destinationLat, destinationLng
        );
        if (!cached.isEmpty()) {
            return cached.get(0);
        }

        RoadDistance road;
        try {
            road = maps.roadDistance(originLat, originLng, destinationLat, destinationLng);
        } catch (ApiException unavailable) {
            // No key, timeout, HTTP error or unusable body (already logged by the client): never fail the caller.
            return new RoadDistance(fallbackMeters(originLat, originLng, destinationLat, destinationLng), null, "FALLBACK");
        }
        jdbcTemplate.update(
            """
                INSERT INTO road_distance_cache (origin_key, destination_key, origin_lat, origin_lng,
                    destination_lat, destination_lng, meters, seconds, source, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OLA', now())
                ON CONFLICT (origin_key, destination_key) DO UPDATE SET
                    origin_lat = EXCLUDED.origin_lat, origin_lng = EXCLUDED.origin_lng,
                    destination_lat = EXCLUDED.destination_lat, destination_lng = EXCLUDED.destination_lng,
                    meters = EXCLUDED.meters, seconds = EXCLUDED.seconds,
                    source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at
                """,
            originKey, destinationKey, originLat, originLng, destinationLat, destinationLng, road.meters(), road.seconds()
        );
        return road;
    }

    /** Haversine great-circle metres x 1.3. */
    static long fallbackMeters(BigDecimal fromLat, BigDecimal fromLng, BigDecimal toLat, BigDecimal toLng) {
        double lat1 = Math.toRadians(fromLat.doubleValue());
        double lat2 = Math.toRadians(toLat.doubleValue());
        double dLat = lat2 - lat1;
        double dLng = Math.toRadians(toLng.doubleValue() - fromLng.doubleValue());
        double a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLng / 2), 2);
        double straightLine = 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
        return Math.round(straightLine * FALLBACK_DETOUR_FACTOR);
    }

    private static BigDecimal round(BigDecimal coordinate) {
        return coordinate.setScale(4, RoundingMode.HALF_UP);
    }
}
