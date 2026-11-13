package in.craves.integration.fleet.trip;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentMatchers;

/** The customer's position feed: one same-status event per new real position of a rider on the way, and nothing else. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetCustomerPositionFeedDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    RoadDistanceClient roads;
    DeliveryOutboxRepository outbox;
    FleetCustomerPositionFeed feed;
    int phones;

    @BeforeEach
    void setUp() {
        roads = mock(RoadDistanceClient.class);
        when(roads.path(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn("abc");
        outbox = new DeliveryOutboxRepository(fleet.db, json);
        feed = new FleetCustomerPositionFeed(fleet.db, outbox, roads, json);
    }

    @Test
    void publishesPositionForPickedUpTrip() {
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        feed.tick();
        List<JsonNode> events = events(c.job);
        assertThat(events).hasSize(1);
        JsonNode data = events.get(0).path("data");
        assertThat(data.path("deliveryJobId").asText()).isEqualTo(c.job.toString());
        assertThat(data.path("chefSubOrderId").asText()).isEqualTo(c.chefSubOrderId.toString());
        assertThat(data.path("providerId").asText()).isEqualTo("craves_fleet");
        assertThat(data.path("providerDeliveryId").asText()).isEqualTo(c.trip.toString());
        assertThat(data.path("status").asText()).isEqualTo("PICKED_UP");
        assertThat(data.path("courierLatitude").asDouble()).isEqualTo(17.45);
        assertThat(data.path("courierLongitude").asDouble()).isEqualTo(78.39);
        assertThat(data.path("routePolyline").asText()).isEqualTo("abc");
        assertThat(data.path("courierLocationObservedAt").asText()).isNotEmpty();
        assertThat(data.path("observedAt").asText()).isEqualTo(data.path("courierLocationObservedAt").asText());
        assertThat(data.has("trackingUrl")).isFalse();
        assertThat(data.has("courierName")).isFalse();
        assertThat(data.has("handoffFromProviderId")).isFalse();
        verify(roads).path(17.44, 78.39, 17.46, 78.36);
    }

    @Test
    void samePositionIsPublishedOnce() {
        Case c = onTheWay("PICKED_UP", "IN_TRANSIT", "craves_fleet");
        feed.tick();
        feed.tick();
        assertThat(events(c.job)).hasSize(1);
    }

    @Test
    void newerPositionIsPublishedAgain() {
        Case c = onTheWay("AT_DROP", "AT_DROPOFF", "craves_fleet");
        feed.tick();
        fleet.db.update("UPDATE fleet_schema.rider_position_latest SET lat = 17.46, lng = 78.40, "
            + "received_at = received_at + INTERVAL '5 seconds' WHERE rider_id = ?", c.rider);
        feed.tick();
        List<JsonNode> events = events(c.job);
        assertThat(events).hasSize(2);
        assertThat(events).extracting(event -> event.path("data").path("courierLatitude").asDouble()).containsExactlyInAnyOrder(17.45, 17.46);
        assertThat(events).extracting(event -> event.path("data").path("status").asText()).containsOnly("AT_DROPOFF");
        verify(roads, times(1)).path(anyDouble(), anyDouble(), anyDouble(), anyDouble());
    }

    @Test
    void noPathStillPublishes() {
        when(roads.path(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(null);
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        feed.tick();
        fleet.db.update("UPDATE fleet_schema.rider_position_latest SET received_at = received_at + INTERVAL '5 seconds' WHERE rider_id = ?",
            c.rider);
        feed.tick();
        List<JsonNode> events = events(c.job);
        assertThat(events).hasSize(2);
        assertThat(events).allSatisfy(event -> {
            assertThat(event.path("data").path("courierLatitude").asDouble()).isEqualTo(17.45);
            assertThat(event.path("data").has("routePolyline")).isFalse();
        });
        verify(roads, times(1)).path(anyDouble(), anyDouble(), anyDouble(), anyDouble());
    }

    @Test
    void tooLongPathIsNotSent() {
        when(roads.path(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn("a".repeat(20_001));
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        feed.tick();
        List<JsonNode> events = events(c.job);
        assertThat(events).hasSize(1);
        assertThat(events.get(0).path("data").path("courierLatitude").asDouble()).isEqualTo(17.45);
        assertThat(events.get(0).path("data").has("routePolyline")).isFalse();
    }

    @Test
    void skipsTripALaterStageTookOver() {
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) VALUES (?, ?, 1, 'CRAVES_FLEET', "
            + "now() + INTERVAL '10 minutes')", UUID.randomUUID(), c.trip);
        fleet.db.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', closed_at = now() WHERE trip_id = ?", c.trip);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) VALUES (?, ?, 2, 'BORZO', "
            + "now() + INTERVAL '10 minutes')", UUID.randomUUID(), c.trip);
        feed.tick();
        assertThat(events(c.job)).isEmpty();
    }

    @Test
    void skipsMockPosition() {
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        fleet.db.update("UPDATE fleet_schema.rider_position_latest SET mock = true WHERE rider_id = ?", c.rider);
        feed.tick();
        assertThat(events(c.job)).isEmpty();
    }

    @Test
    void skipsPositionFromBeforePickup() {
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        fleet.db.update("UPDATE fleet_schema.trip SET picked_up_at = now() WHERE id = ?", c.trip);
        feed.tick();
        assertThat(events(c.job)).isEmpty();
    }

    @Test
    void skipsPositionOfAnotherTrip() {
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        UUID other = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.rider_position_latest SET trip_id = ? WHERE rider_id = ?", other, c.rider);
        feed.tick();
        assertThat(events(c.job)).isEmpty();
    }

    @Test
    void skipsAssignedTrip() {
        Case c = onTheWay("ASSIGNED", "COURIER_ASSIGNED", "craves_fleet");
        feed.tick();
        assertThat(events(c.job)).isEmpty();
    }

    @Test
    void skipsDeliveredTrip() {
        Case c = onTheWay("DELIVERED", "DELIVERED", "craves_fleet");
        feed.tick();
        assertThat(events(c.job)).isEmpty();
    }

    @Test
    void skipsJobOfAnotherProvider() {
        Case c = onTheWay("PICKED_UP", "PICKED_UP", "borzo");
        feed.tick();
        assertThat(events(c.job)).isEmpty();
    }

    @Test
    void oneFailingTripDoesNotStopTheOthers() {
        Case first = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        Case second = onTheWay("PICKED_UP", "PICKED_UP", "craves_fleet");
        DeliveryOutboxRepository failing = spy(outbox);
        doThrow(new IllegalStateException("outbox down")).doCallRealMethod().when(failing).enqueue(ArgumentMatchers.anyString(),
            ArgumentMatchers.any(), ArgumentMatchers.any(), ArgumentMatchers.any());
        new FleetCustomerPositionFeed(fleet.db, failing, roads, json).tick();
        assertThat(events(first.job).size() + events(second.job).size()).isEqualTo(1);
    }

    /** A rider on a trip in this state, picked up a minute ago, whose real fix arrived 10 s ago, and the trip's delivery job. */
    private Case onTheWay(String tripState, String jobStatus, String jobProvider) {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID trip = fleet.trip(chefSubOrderId);
        UUID rider = fleet.rider("Ravi Kumar", "+9198000000" + String.format("%02d", ++phones));
        // A delivered trip no longer holds the rider's one-active-trip slot, so only the live states collide per rider.
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = ?, picked_up_at = now() - INTERVAL '1 minute' WHERE id = ?",
            rider, tripState, trip);
        FleetDispatchFixtures.fix(fleet.db, rider, 17.45, 78.39, 10, false);
        fleet.db.update("UPDATE fleet_schema.rider_position_latest SET trip_id = ? WHERE rider_id = ?", trip, rider);
        UUID order = fleet.db.queryForObject("SELECT order_id FROM fleet_schema.trip WHERE id = ?", UUID.class, trip);
        UUID job = FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, order, trip, jobStatus);
        if (!"craves_fleet".equals(jobProvider)) {
            fleet.db.update("UPDATE delivery_schema.delivery_job SET provider_id = ? WHERE id = ?", jobProvider, job);
        }
        return new Case(chefSubOrderId, trip, rider, job);
    }

    private record Case(UUID chefSubOrderId, UUID trip, UUID rider, UUID job) {
    }

    private List<JsonNode> events(UUID job) {
        List<JsonNode> events = new ArrayList<>();
        for (String payload : fleet.db.queryForList("SELECT payload::text FROM delivery_schema.delivery_outbox WHERE aggregate_id = ?",
            String.class, job)) {
            try {
                events.add(json.readTree(payload));
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        }
        return events;
    }
}
