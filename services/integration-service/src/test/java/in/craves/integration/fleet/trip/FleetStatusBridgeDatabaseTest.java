package in.craves.integration.fleet.trip;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.DeliveryCodeClient;
import in.craves.integration.fleet.client.DeliveryCodeClient.Outcome;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.fleet.dispatch.FleetDispatcher;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * A rider trip through the existing delivery-status pipeline (PLAN F10): the outbox gets craves_fleet events with the
 * rider card, in step order, as order-service reads them.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetStatusBridgeDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    FleetTripService trips;
    FleetStatusBridge bridge;
    DeliveryStatusUpdateService statusUpdates;
    UUID chefSubOrderId;
    UUID identity;
    UUID rider;
    UUID tripId;

    @BeforeEach
    void setUp() {
        FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        FleetDispatcher dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies,
            new FleetTestMode(fleet.db, FleetDatabase.properties(true)), roads, mock(RiderPushClient.class), json);
        DeliveryOutboxRepository outbox = new DeliveryOutboxRepository(fleet.db, json);
        statusUpdates = new DeliveryStatusUpdateService(List.of(), new DeliveryStatusRepository(fleet.db, json), outbox,
            new DeliveryCommandProperties(), json, new BorzoPidgeHandoffRepository(fleet.db));
        bridge = new FleetStatusBridge(fleet.db, outbox, new DeliveryCommandRepository(fleet.db, json), statusUpdates, json);
        DeliveryCodeClient codes = mock(DeliveryCodeClient.class);
        when(codes.verify(any(), anyString())).thenReturn(new DeliveryCodeClient.Result(Outcome.VERIFIED, 0));
        trips = new FleetTripService(fleet.db, new FleetTripPay(fleet.db, policies, json, event -> { }), bridge, json, codes,
            mock(FleetStorage.class), fleet.transactions);
        FleetDispatchFixtures.policy(fleet.db, "live");
        rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider SET name = 'Ravi Kumar Reddy' WHERE id = ?", rider);
        identity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, rider);
        chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(chefSubOrderId), OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        UUID offer = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip_offer", UUID.class);
        tripId = UUID.fromString(new TransactionTemplate(fleet.transactions).execute(status -> trips.accept(identity, offer, "a1")).tripId());
    }

    @Test
    void aRiderTripPublishesEveryStepAsCravesFleetWithTheRiderCard() throws Exception {
        trips.step(identity, tripId, "arrived-pickup", "s1");
        Thread.sleep(5);
        trips.step(identity, tripId, "picked-up", "s2");
        Thread.sleep(5);
        // The rider moves after pickup: the tracking poll reports IN_TRANSIT once.
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT + 0.003, KITCHEN_LNG, 0, false);
        UUID job = fleet.db.queryForObject("SELECT id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", UUID.class, chefSubOrderId);
        TrackingWorkItem poll = new TrackingWorkItem(job, fleet.db.queryForObject("SELECT order_id FROM fleet_schema.trip WHERE id = ?",
            UUID.class, tripId), chefSubOrderId, "craves_fleet", tripId.toString(), 1);
        assertThat(statusUpdates.processTracking(poll, bridge.snapshot(tripId)).applied()).isTrue();
        assertThat(statusUpdates.processTracking(poll, bridge.snapshot(tripId)).applied()).as("once").isFalse();
        Thread.sleep(5);
        trips.step(identity, tripId, "arrived-drop", "s3");
        Thread.sleep(5);
        trips.deliveredByOtp(identity, tripId, "4821", "d1");

        List<JsonNode> events = events(job);
        assertThat(events).extracting(event -> event.path("data").path("status").asText())
            .containsExactly("COURIER_ASSIGNED", "AT_PICKUP", "PICKED_UP", "IN_TRANSIT", "AT_DROPOFF", "DELIVERED");
        assertThat(events).allSatisfy(event -> {
            assertThat(event.path("data").path("providerId").asText()).isEqualTo("craves_fleet");
            assertThat(event.path("data").path("providerDeliveryId").asText()).isEqualTo(tripId.toString());
            assertThat(event.path("data").path("chefSubOrderId").asText()).isEqualTo(chefSubOrderId.toString());
            assertThat(event.path("data").path("courierName").asText()).isEqualTo("Ravi R.");
            assertThat(event.path("data").path("courierPhone").asText()).isEqualTo("+919800000001");
            assertThat(event.path("data").has("courierPhotoUrl")).as("no public rider photo yet").isFalse();
            assertThat(event.path("data").has("handoffFromProviderId")).isFalse();
        });
        assertThat(fleet.db.queryForObject("SELECT status FROM delivery_schema.delivery_job WHERE id = ?", String.class, job))
            .isEqualTo("DELIVERED");
    }

    @Test
    void aTripAnotherStageTookOverIsNeverReportedCancelled() {
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', finished_at = now(), updated_at = now() WHERE id = ?", tripId);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) VALUES (?, ?, 2, 'PIDGE', now() + INTERVAL '10 minutes')",
            UUID.randomUUID(), tripId);
        assertThat(bridge.snapshot(tripId).delivery().status()).isEqualTo(DeliveryStatus.UNKNOWN);
        bridge.publish(tripId);
        UUID job = fleet.db.queryForObject("SELECT id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", UUID.class, chefSubOrderId);
        assertThat(events(job)).extracting(event -> event.path("data").path("status").asText()).containsExactly("COURIER_ASSIGNED");
    }

    @Test
    void anOpsCancelBeforePickupIsReportedCancelledAndPaysThePickupLeg() {
        assertThat(trips.cancel(tripId, "Customer cancelled the order.")).hasValue("CANCELLED");
        assertThat(bridge.snapshot(tripId).delivery().status()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(fleet.db.queryForObject("SELECT final_pay_paise FROM fleet_schema.trip WHERE id = ?", Long.class, tripId))
            .as("riding to the kitchen: pickup-leg pay only, 0 here inside the free km").isZero();
    }

    private List<JsonNode> events(UUID job) {
        List<JsonNode> events = new ArrayList<>();
        for (String payload : fleet.db.queryForList("SELECT payload::text FROM delivery_schema.delivery_outbox WHERE aggregate_id = ? "
            + "ORDER BY created_at, payload -> 'data' ->> 'observedAt'", String.class, job)) {
            try {
                events.add(json.readTree(payload));
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        }
        return events;
    }
}
