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
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
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
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.client.DeliveryCodeClient;
import in.craves.integration.fleet.trip.FleetStatusBridge;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import in.craves.integration.fleet.trip.FleetTripService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** The dispatch chain's clock (PLAN F8a, F8b): watchdog, Borzo, Pidge and the ops queue, against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetDispatchJobsDatabaseTest {
    /** Long enough at the kitchen for the watchdog to hand the trip back (KITCHEN_HANDBACK_SECONDS). */
    static final int KITCHEN_SILENT = 301;
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
        FleetTripPay tripPay = new FleetTripPay(fleet.db, policies, json, events::add);
        FleetStatusBridge bridge = new FleetStatusBridge(fleet.db, new DeliveryOutboxRepository(fleet.db, json), commands,
            mock(DeliveryStatusUpdateService.class), json);
        FleetTripService trips = new FleetTripService(fleet.db, tripPay, bridge, json, mock(DeliveryCodeClient.class), mock(FleetStorage.class),
            fleet.transactions, mock(RiderPushClient.class));
        jobs = new FleetDispatchJobs(fleet.db, fleet.transactions, dispatcher, tripPay, trips, alerts, router, commands, assignments,
            handoffs, new DeliveryOutboxRepository(fleet.db, json), json);
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
        FleetDispatchFixtures.seen(fleet.db, rider, 100);
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

    /**
     * The watchdog reads the heartbeat (blueprint A1, E2): on the way to the kitchen a trip goes back at 90 s silent; at the
     * kitchen, where the rider may hold the food, ops is alerted once at 90 s and the trip goes back only at 300 s; and a
     * phone that keeps calling without a new fix keeps its trip.
     */
    @Test
    void theWatchdogNeverTakesTheFoodFromARiderWhosePhoneIsStillCalling() {
        when(router.borzoTimedPolicyReady()).thenReturn(false);
        UUID toKitchen = acceptedTrip(UUID.randomUUID(), "ASSIGNED");
        FleetDispatchFixtures.seen(fleet.db, rider, 91);
        assertThat(jobs.watchdog()).isEqualTo(1);
        assertThat(state(toKitchen)).isEqualTo("CANCELLED");

        UUID cook = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        UUID atKitchen = acceptedTrip(UUID.randomUUID(), "AT_PICKUP", cook);
        FleetDispatchFixtures.seen(fleet.db, cook, 120);
        assertThat(jobs.watchdog()).isZero();
        assertThat(jobs.watchdog()).isZero();
        assertThat(state(atKitchen)).isEqualTo("AT_PICKUP");
        verify(alerts, times(1)).opsAlert(eq("FLEET_RIDER_SILENT_AT_KITCHEN"), anyString(), anyString(), anyMap());
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_event WHERE trip_id = ? AND kind = 'WATCHDOG_ALERTED'",
            Integer.class, atKitchen)).isEqualTo(1);
        FleetDispatchFixtures.seen(fleet.db, cook, KITCHEN_SILENT);
        assertThat(jobs.watchdog()).isEqualTo(1);
        assertThat(state(atKitchen)).isEqualTo("CANCELLED");
        verify(alerts, times(1)).opsAlert(eq("FLEET_RIDER_SILENT_AT_KITCHEN"), anyString(), anyString(), anyMap());

        // Calling every few seconds with no new fix for 5 minutes (a phone parked indoors): the trip stays.
        UUID parked = FleetDispatchFixtures.riderOnShift(fleet, "+919800000004", KITCHEN_LAT, KITCHEN_LNG, 300, false);
        FleetDispatchFixtures.seen(fleet.db, parked, 5);
        UUID kept = acceptedTrip(UUID.randomUUID(), "ASSIGNED", parked);
        fleet.db.update("UPDATE fleet_schema.trip SET accepted_at = now() - INTERVAL '6 minutes' WHERE id = ?", kept);
        assertThat(jobs.watchdog()).isZero();
        assertThat(state(kept)).isEqualTo("ASSIGNED");
    }

    /** Retention (blueprint E6): a position goes 15 minutes after the shift ends, and never while the rider is on a trip. */
    @Test
    void offShiftPositionsAreForgottenAfterFifteenMinutesButNotDuringATrip() {
        UUID delivering = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        acceptedTrip(UUID.randomUUID(), "PICKED_UP", delivering);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET ended_at = now() WHERE rider_id IN (?, ?)", rider, delivering);
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT, KITCHEN_LNG, 14 * 60, false);
        FleetDispatchFixtures.fix(fleet.db, delivering, KITCHEN_LAT, KITCHEN_LNG, 20 * 60, false);
        UUID waiting = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT, KITCHEN_LNG, 20 * 60, false);

        assertThat(jobs.forgetOffShiftPositions()).as("14 minutes after the last fix: kept").isZero();
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT, KITCHEN_LNG, 16 * 60, false);
        assertThat(jobs.forgetOffShiftPositions()).isEqualTo(1);
        assertThat(fleet.db.queryForList("SELECT rider_id FROM fleet_schema.rider_position_latest", UUID.class))
            .containsExactlyInAnyOrder(delivering, waiting);
    }

    /**
     * Blueprint A7: a shift still open whose phone stopped calling gets one "tap to go online" push per 30 minutes; none for
     * an ended shift, an unbound phone, app 1.0.0 (it can't show it) or a phone that is still calling.
     */
    @Test
    void aSilentOpenShiftGetsOneGoOnlinePushPerHalfHour() {
        when(alerts.goOnline(anyString())).thenReturn("SENT");
        FleetDispatchFixtures.seen(fleet.db, rider, 200);
        UUID ended = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 200, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET ended_at = now() WHERE rider_id = ?", ended);
        UUID unbound = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT, KITCHEN_LNG, 200, false);
        fleet.db.update("UPDATE fleet_schema.rider_device SET state = 'PENDING_APPROVAL' WHERE rider_id = ?", unbound);
        UUID calling = FleetDispatchFixtures.riderOnShift(fleet, "+919800000004", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_device SET app_version = '1.1.0' WHERE rider_id IN (?, ?, ?, ?)", rider, ended, unbound, calling);
        UUID oldApp = FleetDispatchFixtures.riderOnShift(fleet, "+919800000005", KITCHEN_LAT, KITCHEN_LNG, 200, false);

        assertThat(jobs.nudgeSilentShifts()).isEqualTo(1);
        verify(alerts, timeout(2000).times(1)).goOnline("fcm-+919800000001");
        assertThat(jobs.nudgeSilentShifts()).as("at most every 30 minutes").isZero();
        fleet.db.update("UPDATE fleet_schema.rider_shift SET last_nudge_at = now() - INTERVAL '31 minutes' WHERE rider_id = ?", rider);
        assertThat(jobs.nudgeSilentShifts()).isEqualTo(1);
        verify(alerts, timeout(2000).times(2)).goOnline("fcm-+919800000001");
        verify(alerts, never()).goOnline("fcm-+919800000005");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_shift WHERE last_nudge_at IS NOT NULL AND rider_id <> ?",
            Integer.class, rider)).as("nobody else: ended " + ended + ", unbound, calling, app 1.0.0 " + oldApp).isZero();
    }

    @Test
    void theHandedBackOrderIsBookedWithTheNextCourierAndTheJobNamesCravesFleetAsTheSource() {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID checkout = UUID.randomUUID();
        UUID trip = acceptedTrip(chefSubOrderId, "AT_PICKUP");
        UUID job = FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, checkout, trip, "AT_PICKUP");
        FleetDispatchFixtures.seen(fleet.db, rider, KITCHEN_SILENT);
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
    void twoReplicasTickingAtOnceBookTheHandedBackOrderOnce() throws Exception {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID trip = acceptedTrip(chefSubOrderId, "ASSIGNED");
        UUID job = FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, UUID.randomUUID(), trip, "COURIER_ASSIGNED");
        FleetDispatchFixtures.seen(fleet.db, rider, 100);
        DeliveryCommandMessage message = FleetDispatchFixtures.command(chefSubOrderId);
        when(commands.findByChefSubOrderId(chefSubOrderId)).thenReturn(Optional.of(new CommandRecord(message.commandId(), chefSubOrderId,
            message.orderId(), "COMPLETED", 1, message, null, null, null, null, null, 0, 0, null, null)));
        AssignmentResponse assignment = new AssignmentResponse(UUID.randomUUID(), chefSubOrderId, message.orderId(), AssignmentStrategy.STOCHASTIC,
            AssignmentStatus.RANKED, "TEST", null, "pidge", null, List.of(), Instant.now());
        fleet.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "request_context) VALUES (?, ?, ?, 'STOCHASTIC', 'RANKED', 'TEST', '{}')", assignment.assignmentId(), chefSubOrderId, message.orderId());
        RoutingResult pidge = new RoutingResult("pidge", new ProviderDelivery("pidge", "PIDGE-78", "PIDGE-78", DeliveryStatus.SEARCHING,
            "searching", null, null, null, null, Instant.now()), assignment, UUID.randomUUID(), List.of(), List.of());
        CountDownLatch booking = new CountDownLatch(1);
        CountDownLatch booked = new CountDownLatch(1);
        when(router.borzoTimedPolicyReady()).thenReturn(false);
        when(router.route(message)).thenAnswer(call -> {
            booking.countDown();
            booked.await(10, TimeUnit.SECONDS);
            return pidge;
        });
        jobs.watchdog();
        ExecutorService replicas = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> first = replicas.submit(jobs::courierStages);
            assertThat(booking.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(replicas.submit(jobs::courierStages).get(10, TimeUnit.SECONDS))
                .as("the other replica skips the order while it is being booked").isZero();
            booked.countDown();
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        } finally {
            replicas.shutdownNow();
        }
        jobs.courierStages();

        verify(router, times(1)).route(message);
        assertThat(fleet.db.queryForObject("SELECT provider_delivery_id FROM delivery_schema.delivery_job WHERE id = ?", String.class, job))
            .isEqualTo("PIDGE-78");
        verify(alerts, never()).opsAlert(eq("FLEET_COURIER_UNRECORDED"), anyString(), anyString(), anyMap());
    }

    @Test
    void aHandedBackOrderCancelledMeanwhileIsNotBooked() {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID trip = acceptedTrip(chefSubOrderId, "ASSIGNED");
        FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, UUID.randomUUID(), trip, "COURIER_ASSIGNED");
        FleetDispatchFixtures.seen(fleet.db, rider, 100);
        when(router.borzoTimedPolicyReady()).thenReturn(false);
        jobs.watchdog();
        fleet.refundRequested(chefSubOrderId);

        assertThat(jobs.courierStages()).isZero();
        verify(router, never()).route(any());
        jobs.cancelledOrders();
        assertThat(stages(trip)).containsExactly("CRAVES_FLEET:CLOSED:ACCEPTED", "PIDGE:CLOSED:CANCELLED");
    }

    @Test
    void anUncertainCourierCreateIsNeverRetriedAndGoesToTheOpsQueue() {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID trip = acceptedTrip(chefSubOrderId, "ASSIGNED");
        FleetDispatchFixtures.fleetJob(fleet.db, chefSubOrderId, UUID.randomUUID(), trip, "COURIER_ASSIGNED");
        FleetDispatchFixtures.seen(fleet.db, rider, 100);
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
        UUID lateSubOrder = UUID.randomUUID();
        UUID lateTrip = courierTrip(lateSubOrder, "PIDGE", true);
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

        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, 'pidge', 'P-9', 'COURIER_ASSIGNED')", UUID.randomUUID(), lateSubOrder, UUID.randomUUID());
        assertThat(jobs.courierStages()).isEqualTo(1);
        assertThat(stages(lateTrip)).as("a courier booked after all clears the ops queue")
            .containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "PIDGE:CLOSED:NO_COURIER", "OPS_QUEUE:CLOSED:ASSIGNED");
    }

    @Test
    void aCancelledOrderEndsItsTripOnTheNextTickWithOffersWithdrawnStagesClosedAndPayForTheStateReached() {
        UUID atKitchenOrder = UUID.randomUUID();
        UUID atKitchen = acceptedTrip(atKitchenOrder, "AT_PICKUP");
        UUID offeredOrder = UUID.randomUUID();
        UUID offered = fleet.trip(offeredOrder);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) VALUES (?, ?, 1, 'CRAVES_FLEET', "
            + "now() + INTERVAL '50 seconds')", UUID.randomUUID(), offered);
        UUID other = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, pay_paise, rate_card_version, pickup_distance_m, "
            + "drop_distance_m, expires_at) VALUES (?, ?, ?, 5350, '2026-10-v1', 200, 3500, now() + INTERVAL '30 seconds')",
            UUID.randomUUID(), offered, other);
        UUID queuedOrder = UUID.randomUUID();
        UUID queued = courierTrip(queuedOrder, "OPS_QUEUE", false);
        UUID goingOn = fleet.trip(UUID.randomUUID());
        fleet.refundRequested(atKitchenOrder);
        fleet.refundRequested(offeredOrder);
        fleet.refundRequested(queuedOrder);

        assertThat(jobs.cancelledOrders()).isEqualTo(3);

        Map<String, Object> paid = fleet.db.queryForMap("SELECT state, cancel_reason, final_pay_paise, pay_held FROM fleet_schema.trip "
            + "WHERE id = ?", atKitchen);
        assertThat(paid).containsEntry("state", "CANCELLED").containsEntry("cancel_reason", FleetTripService.ORDER_CANCELLED)
            .containsEntry("final_pay_paise", 2720L).as("the rider did nothing wrong").containsEntry("pay_held", false);
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> assertThat(event.held()).isFalse());
        assertThat(fleet.db.queryForMap("SELECT state, final_pay_paise FROM fleet_schema.trip WHERE id = ?", offered))
            .containsEntry("state", "CANCELLED").as("no rider took it").containsEntry("final_pay_paise", null);
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_offer WHERE trip_id = ?", String.class, offered))
            .isEqualTo("WITHDRAWN");
        assertThat(stages(offered)).containsExactly("CRAVES_FLEET:CLOSED:CANCELLED");
        assertThat(stages(queued)).as("no courier is booked or queued for a cancelled order")
            .containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "OPS_QUEUE:CLOSED:CANCELLED");
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE id = ?", String.class, goingOn))
            .as("an order nobody cancelled").isEqualTo("SEARCHING");
        assertThat(jobs.cancelledOrders()).as("each trip ends once").isZero();
        assertThat(jobs.courierStages()).isZero();
        verify(alerts, never()).opsAlert(anyString(), anyString(), anyString(), anyMap());
    }

    private UUID acceptedTrip(UUID chefSubOrderId, String state) {
        return acceptedTrip(chefSubOrderId, state, rider);
    }

    private String state(UUID trip) {
        return fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE id = ?", String.class, trip);
    }

    private UUID acceptedTrip(UUID chefSubOrderId, String state, UUID riderId) {
        UUID trip = fleet.trip(chefSubOrderId);
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = ?, accepted_at = now() - INTERVAL '2 minutes', "
            + "rate_card_version = '2026-10-v1', pickup_distance_m = 1800, drop_distance_m = 3500 WHERE id = ?", riderId, state, trip);
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
