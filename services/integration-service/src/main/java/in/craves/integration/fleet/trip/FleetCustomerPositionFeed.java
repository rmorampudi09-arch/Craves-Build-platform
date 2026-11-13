package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryStatusChangedData;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.client.RoadDistanceClient;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * While a rider's order is on the way, the customer's tracking map gets the rider's newest real position and the road path to
 * the drop: a same-status DELIVERY_STATUS_CHANGED event per new position, which order-service stores. Reads the fleet tables and
 * writes only the outbox (never delivery_job, never a fleet table), and runs on the fleet pool, off the location upload path.
 */
@Component
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.customer-position-enabled"}, havingValue = "true")
public class FleetCustomerPositionFeed {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetCustomerPositionFeed.class);
    /** order-service rejects (and dead-letters) the whole event for a longer path, so a longer one is sent as no path. */
    static final int MAX_ROUTE_POLYLINE = 20_000;
    private static final String ON_THE_WAY = """
        SELECT t.id, t.order_id, t.chef_sub_order_id, t.kitchen_lat, t.kitchen_lng, t.drop_lat, t.drop_lng, j.id AS job_id, j.status, p.lat, p.lng, p.received_at
        FROM fleet_schema.trip t
        JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = t.chef_sub_order_id AND j.provider_id = 'craves_fleet'
          AND j.provider_delivery_id = t.id::text AND j.status IN ('PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF')
        JOIN fleet_schema.rider_position_latest p ON p.rider_id = t.rider_id AND p.trip_id = t.id AND NOT p.mock
          AND p.received_at > t.picked_up_at
        WHERE t.state IN ('PICKED_UP', 'AT_DROP')
          AND COALESCE((SELECT s.provider FROM fleet_schema.trip_stage s WHERE s.trip_id = t.id ORDER BY s.seq DESC LIMIT 1) = 'CRAVES_FLEET', true)
        ORDER BY p.received_at""";

    private final JdbcTemplate jdbc;
    private final DeliveryOutboxRepository outbox;
    private final RoadDistanceClient roads;
    private final ObjectMapper json;
    // shortcut: per-instance memory, so two instances publish each position twice (order-service stores the same values); move to a column if instances grow
    private final Map<UUID, Instant> published = new HashMap<>();
    private final Map<UUID, Optional<String>> paths = new HashMap<>();

    public FleetCustomerPositionFeed(JdbcTemplate jdbc, DeliveryOutboxRepository outbox, RoadDistanceClient roads, ObjectMapper json) {
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.roads = roads;
        this.json = json;
    }

    @Scheduled(scheduler = FleetConfiguration.FLEET_SCHEDULER, fixedDelayString = "${craves.fleet.customer-position-tick-ms:20000}")
    public void tick() {
        try {
            List<Map<String, Object>> trips = jdbc.queryForList(ON_THE_WAY);
            Set<UUID> seen = new HashSet<>();
            for (Map<String, Object> trip : trips) {
                UUID tripId = (UUID) trip.get("id");
                seen.add(tripId);
                try {
                    publish(tripId, trip);
                } catch (RuntimeException exception) {
                    LOGGER.warn("FLEET_CUSTOMER_POSITION_FAILED trip={} reason={}", tripId, exception.getMessage());
                }
            }
            published.keySet().retainAll(seen);
            paths.keySet().retainAll(seen);
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_CUSTOMER_POSITION_FAILED trip=all reason={}", exception.getMessage());
        }
    }

    private void publish(UUID tripId, Map<String, Object> trip) {
        Instant at = ((java.sql.Timestamp) trip.get("received_at")).toInstant();
        if (at.equals(published.get(tripId))) {
            return;
        }
        double lat = ((Number) trip.get("lat")).doubleValue();
        double lng = ((Number) trip.get("lng")).doubleValue();
        // The road path kitchen to drop is asked once per trip (a null or too long answer too), so it never changes mid-trip.
        String path = paths.computeIfAbsent(tripId, id -> Optional.ofNullable(roads.path(((Number) trip.get("kitchen_lat")).doubleValue(),
            ((Number) trip.get("kitchen_lng")).doubleValue(), ((Number) trip.get("drop_lat")).doubleValue(),
            ((Number) trip.get("drop_lng")).doubleValue())).filter(p -> p.length() <= MAX_ROUTE_POLYLINE)).orElse(null);
        UUID job = (UUID) trip.get("job_id");
        UUID order = (UUID) trip.get("order_id");
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(job, order, (UUID) trip.get("chef_sub_order_id"),
            FleetStatusBridge.PROVIDER_ID, tripId.toString(), (String) trip.get("status"), null, at, null, null, null, null, null, null,
            null, BigDecimal.valueOf(lat), BigDecimal.valueOf(lng), at, path);
        outbox.enqueue(DeliveryCommandModels.DELIVERY_STATUS_CHANGED, job, order, json.valueToTree(new EventEnvelope<>(
            UUID.randomUUID(), DeliveryCommandModels.DELIVERY_STATUS_CHANGED, "1.0", Instant.now(), order, null,
            "integration-service", "delivery-job/" + job, data)));
        published.put(tripId, at);
    }
}
