package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStrategy;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryCreateReconciliationPendingException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** The dispatch chain's clock (PLAN F8a, F8b): watchdog, Borzo, Pidge and the ops queue, against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetDispatchJobsDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final RiderPushClient alerts = mock(RiderPushClient.class);
    final DeliveryProviderRouter router = mock(DeliveryProviderRouter.class);
    final DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
    final DeliveryAssignmentRepository assignments = mock(DeliveryAssignmentRepository.class);
    final BorzoPidgeHandoffRepository handoffs = mock(BorzoPidgeHandoffRepository.class);
    final List<Object> events = new ArrayList<>();
    FleetDispatchJobs jobs;
    UUID rider;

    @BeforeEach
    void setUp() {
        FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
        FleetDispatcher dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies,
            new FleetTestMode(fleet.db, FleetDatabase.properties(true)), mock(RoadDistanceClient.class), alerts, json);
        jobs = new FleetDispatchJobs(fleet.db, fleet.transactions, dispatcher, new FleetTripPay(fleet.db, policies, json, events::add),
            alerts, router, commands, assignments, handoffs, new DeliveryOutboxRepository(fleet.db, json), json);
        FleetDispatchFixtures.policy(fleet.db, "live");
        rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
    }

    @Test
    void offersExpireOnTheServer() {
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, pay_paise, rate_card_version, pickup_distance_m, "
            + "drop_distance_m, offered_at, expires_at) VALUES (?, ?, ?, 6070, '2026-10-v1', 1800, 3500, now() - INTERVAL '41 seconds', "
            + "now() - INTERVAL '1 second')", UUID.randomUUID(), trip, rider);
        assertThat(jobs.expireOffers()).isEqualTo(1);
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_offer", String.class)).isEqualTo("EXPIRED");
    }

    @Test
    void aRiderSilentForNinetySecondsBeforePickupLosesTheTripWithHeldPickupPayAndNoCancelledStatus() {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID trip = acceptedTrip(chefSubOrderId, "ASSIGNED");
        UUID job = FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, UUID.randomUUID(), trip, "COURIER_ASSIGNED");
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT, KITCHEN_LNG, 100, false);
        UUID talking = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        UUID other = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'ASSIGNED', accepted_at = now() - INTERVAL '5 minutes', "
            + "rate_card_version = '2026-10-v1', pickup_distance_m = 900 WHERE id = ?", talking, other);
        when(router.borzoTimedPolicyReady()).thenReturn(false);

        assertThat(jobs.watchdog()).isEqualTo(1);

        Map<String, Object> lost = fleet.db.queryForMap("SELECT state, cancel_reason, final_pay_paise, pay_held FROM fleet_schema.trip WHERE id = ?", trip);
        assertThat(lost.get("state")).isEqualTo("CANCELLED");
        assertThat(lost.get("final_pay_paise")).as("pickup-leg pay: 1800 m, 800 m after the free km").isEqualTo(720L);
        assertThat(lost.get("pay_held")).isEqualTo(true);
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> {
            assertThat(event.held()).isTrue();
            assertThat(event.riderId()).isEqualTo(rider);
        });
        assertThat(fleet.db.queryForList("SELECT provider || ':' || state FROM fleet_schema.trip_stage WHERE trip_id = ? ORDER BY seq",
            String.class, trip)).containsExactly("CRAVES_FLEET:CLOSED", "PIDGE:OPEN");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_outbox WHERE aggregate_id = ?", Integer.class, job))
            .as("never CANCELLED for a superseded stage").isZero();
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE id = ?", String.class, other)).isEqualTo("ASSIGNED");
        verify(alerts).opsAlert(eq("FLEET_RIDER_LOST"), anyString(), anyString(), anyMap());
        assertThat(jobs.watchdog()).isZero();
    }

    @Test
    void theHandedBackOrderIsBookedWithTheNextCourierAndTheJobNamesCravesFleetAsTheSource() {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID checkout = UUID.randomUUID();
        UUID trip = acceptedTrip(chefSubOrderId, "AT_PICKUP");
        UUID job = FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, checkout, trip, "AT_PICKUP");
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT, KITCHEN_LNG, 100, false);
        DeliveryCommandMessage message = FleetDispatchFixtures.command(chefSubOrderId);
        when(commands.findByChefSubOrderId(chefSubOrderId)).thenReturn(Optional.of(new CommandRecord(message.commandId(), chefSubOrderId,
            checkout, "COMPLETED", 1, message, null, null, null, null, null, 0, 0, null, null)));
        AssignmentResponse assignment = new AssignmentResponse(UUID.randomUUID(), chefSubOrderId, checkout, AssignmentStrategy.STOCHASTIC,
            AssignmentStatus.RANKED, "TEST", null, "pidge", null, List.of(), Instant.now());
        // The router stores its assignment before it books; the job then references it.
        fleet.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "request_context) VALUES (?, ?, ?, 'STOCHASTIC', 'RANKED', 'TEST', '{}')", assignment.assignmentId(), chefSubOrderId, checkout);
        RoutingResult pidge = new RoutingResult("pidge", new ProviderDelivery("pidge", "PIDGE-77", "PIDGE-77", DeliveryStatus.COURIER_ASSIGNED,
            "assigned", null, null, "https://track.pidge.in/77", null, Instant.now()), assignment, UUID.randomUUID(), List.of(), List.of());
        when(router.borzoTimedPolicyReady()).thenReturn(false);
        when(router.route(message)).thenReturn(pidge);

        jobs.watchdog();
        assertThat(jobs.courierStages()).isEqualTo(1);

        Map<String, Object> switched = fleet.db.queryForMap("SELECT provider_id, provider_delivery_id, status FROM delivery_schema.delivery_job "
            + "WHERE id = ?", job);
        assertThat(switched).containsEntry("provider_id", "pidge").containsEntry("provider_delivery_id", "PIDGE-77")
            .containsEntry("status", "COURIER_ASSIGNED");
        JsonNode event = readTree(fleet.db.queryForObject("SELECT payload::text FROM delivery_schema.delivery_outbox WHERE aggregate_id = ?",
            String.class, job));
        assertThat(event.path("data").path("providerId").asText()).isEqualTo("pidge");
        assertThat(event.path("data").path("status").asText()).isEqualTo("COURIER_ASSIGNED");
        assertThat(event.path("data").path("handoffFromProviderId").asText()).isEqualTo("craves_fleet");
        assertThat(event.path("data").path("handoffFromProviderDeliveryId").asText()).isEqualTo(trip.toString());
        verify(assignments).markAssigned(eq(assignment.assignmentId()), eq(pidge.executedCandidateId()), eq(List.of()));
        verify(handoffs, never()).enroll(any(), any(), any());
        assertThat(fleet.db.queryForObject("SELECT final_pay_paise FROM fleet_schema.trip WHERE id = ?", Long.class, trip))
            .as("at the kitchen: ₹20 cancellation fee plus 720 pickup-leg pay").isEqualTo(2720L);
    }

    @Test
    void anUncertainCourierCreateIsNeverRetriedAndGoesToTheOpsQueue() {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID trip = acceptedTrip(chefSubOrderId, "ASSIGNED");
        FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, UUID.randomUUID(), trip, "COURIER_ASSIGNED");
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT, KITCHEN_LNG, 100, false);
        DeliveryCommandMessage message = FleetDispatchFixtures.command(chefSubOrderId);
        when(commands.findByChefSubOrderId(chefSubOrderId)).thenReturn(Optional.of(new CommandRecord(message.commandId(), chefSubOrderId,
            message.orderId(), "COMPLETED", 1, message, null, null, null, null, null, 0, 0, null, null)));
        when(router.route(message)).thenThrow(new DeliveryCreateReconciliationPendingException("pidge", chefSubOrderId.toString(),
            Instant.now(), "timeout"));

        jobs.watchdog();
        jobs.courierStages();
        jobs.courierStages();

        verify(router).route(message);
        assertThat(fleet.db.queryForList("SELECT provider || ':' || state || ':' || COALESCE(outcome, '') FROM fleet_schema.trip_stage "
            + "WHERE trip_id = ? ORDER BY seq", String.class, trip))
            .containsExactly("CRAVES_FLEET:CLOSED:ACCEPTED", "PIDGE:CLOSED:UNCERTAIN_CREATE_PIDGE", "OPS_QUEUE:OPEN:");
        verify(alerts).opsAlert(eq("FLEET_DISPATCH_QUEUE"), anyString(), anyString(), anyMap());
    }

    @Test
    void borzoMovesToPidgeAtItsDeadlinePidgeToTheOpsQueueAndAnAssignedCourierClosesTheStage() {
        UUID waitingTrip = courierTrip(UUID.randomUUID(), "BORZO", true);
        UUID lateTrip = courierTrip(UUID.randomUUID(), "PIDGE", true);
        UUID assignedSubOrder = UUID.randomUUID();
        UUID assignedTrip = courierTrip(assignedSubOrder, "BORZO", false);
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, 'borzo', 'B-1', 'COURIER_ASSIGNED')", UUID.randomUUID(), assignedSubOrder, UUID.randomUUID());

        assertThat(jobs.courierStages()).isEqualTo(3);

        assertThat(stages(waitingTrip)).containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "BORZO:CLOSED:NO_COURIER", "PIDGE:OPEN:");
        assertThat(fleet.db.queryForObject("SELECT provider FROM fleet_schema.trip WHERE id = ?", String.class, waitingTrip)).isEqualTo("PIDGE");
        assertThat(stages(lateTrip)).containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "PIDGE:CLOSED:NO_COURIER", "OPS_QUEUE:OPEN:");
        assertThat(fleet.db.queryForObject("SELECT provider FROM fleet_schema.trip WHERE id = ?", String.class, lateTrip)).isEqualTo("OPS_QUEUE");
        assertThat(stages(assignedTrip)).containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "BORZO:CLOSED:ASSIGNED");
        verify(alerts).opsAlert(eq("FLEET_DISPATCH_QUEUE"), anyString(), anyString(), anyMap());
        assertThat(jobs.courierStages()).as("a stage that is not due waits").isZero();
    }

    private UUID acceptedTrip(UUID chefSubOrderId, String state) {
        UUID trip = fleet.trip(chefSubOrderId);
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = ?, accepted_at = now() - INTERVAL '2 minutes', "
            + "rate_card_version = '2026-10-v1', pickup_distance_m = 1800, drop_distance_m = 3500 WHERE id = ?", rider, state, trip);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, state, outcome, opened_at, deadline_at, closed_at) "
            + "VALUES (?, ?, 1, 'CRAVES_FLEET', 'CLOSED', 'ACCEPTED', now() - INTERVAL '3 minutes', now() - INTERVAL '2 minutes', "
            + "now() - INTERVAL '2 minutes')", UUID.randomUUID(), trip);
        return trip;
    }

    private UUID courierTrip(UUID chefSubOrderId, String provider, boolean due) {
        UUID trip = fleet.trip(chefSubOrderId);
        fleet.db.update("UPDATE fleet_schema.trip SET provider = ? WHERE id = ?", provider, trip);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, state, outcome, opened_at, deadline_at, closed_at) "
            + "VALUES (?, ?, 1, 'CRAVES_FLEET', 'CLOSED', 'NO_ACCEPT', now() - INTERVAL '20 minutes', now() - INTERVAL '19 minutes', "
            + "now() - INTERVAL '19 minutes')", UUID.randomUUID(), trip);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, opened_at, deadline_at) VALUES (?, ?, 2, ?, "
            + "now() - INTERVAL '19 minutes', " + (due ? "now() - INTERVAL '1 second'" : "now() + INTERVAL '1 minute'") + ")",
            UUID.randomUUID(), trip, provider);
        return trip;
    }

    private List<String> stages(UUID trip) {
        return fleet.db.queryForList("SELECT provider || ':' || state || ':' || COALESCE(outcome, '') FROM fleet_schema.trip_stage "
            + "WHERE trip_id = ? ORDER BY seq", String.class, trip);
    }

    private JsonNode readTree(String text) {
        try {
            return json.readTree(text);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
