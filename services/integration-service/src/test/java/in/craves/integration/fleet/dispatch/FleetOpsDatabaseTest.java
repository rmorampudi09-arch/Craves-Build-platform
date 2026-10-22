package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.client.DeliveryCodeClient;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetOpsService.Attempt;
import in.craves.integration.fleet.dispatch.FleetOpsService.OpsTrip;
import in.craves.integration.fleet.dispatch.FleetOpsService.Position;
import in.craves.integration.fleet.dispatch.FleetOpsService.QueueItem;
import in.craves.integration.fleet.dispatch.FleetOpsService.ReassignInput;
import in.craves.integration.fleet.trip.FleetStatusBridge;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import in.craves.integration.fleet.trip.FleetTripService;
import in.craves.integration.payout.bank.BankDataCipher;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionTemplate;

/** Ops console trips (admin-fleet-v1 /trips): list, reassign and cancel through the dispatch chain, against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetOpsDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryStatusUpdateService statusUpdates = mock(DeliveryStatusUpdateService.class);
    final List<Object> events = new ArrayList<>();
    final Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
    final UUID chefSubOrderId = UUID.fromString("0bde0101-2222-4222-8222-222222222222");
    FleetDispatcher dispatcher;
    FleetTripService trips;
    FleetOpsService service;
    DeliveryCommandMessage command;
    UUID near;
    UUID other;

    @BeforeEach
    void setUp() {
        FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
        FleetTestMode testMode = new FleetTestMode(fleet.db, FleetDatabase.properties(true));
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies, testMode, roads, mock(RiderPushClient.class), json);
        DeliveryCommandRepository commands = new DeliveryCommandRepository(fleet.db, json);
        FleetStatusBridge bridge = new FleetStatusBridge(fleet.db, new DeliveryOutboxRepository(fleet.db, json), commands, statusUpdates, json);
        FleetTripPay pay = new FleetTripPay(fleet.db, policies, json, events::add);
        trips = new FleetTripService(fleet.db, pay, bridge, json, mock(DeliveryCodeClient.class), mock(FleetStorage.class), fleet.transactions);
        FleetAdminService admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class));
        service = new FleetOpsService(fleet.db, fleet.transactions, policies, testMode, dispatcher, trips, pay, bridge, admin);
        FleetDispatchFixtures.policy(fleet.db, "live");
        near = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        other = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.01, KITCHEN_LNG, 5, false);
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
        command = FleetDispatchFixtures.command(chefSubOrderId);
        commands.createOrFind(command);
        fleet.db.update("UPDATE delivery_schema.delivery_command SET status = 'WAITING_FOR_PROVIDER', provider_wait_started_at = now(), "
            + "next_provider_retry_at = now() + INTERVAL '10 seconds' WHERE chef_sub_order_id = ?", chefSubOrderId);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
    }

    @Test
    void theListShowsOrdersStillMovingWithTheirCourierAndNotFinishedOnes() {
        OpsTrip searching = single();
        assertThat(searching.state()).isEqualTo("SEARCHING");
        assertThat(searching.provider()).isEqualTo("CRAVES_FLEET");
        assertThat(searching.riderId()).isNull();
        assertThat(searching.orderCode()).isEqualTo("#0BDE0101");
        assertThat(searching.kitchenName()).isEqualTo("Lakshmi's Kitchen");
        assertThat(searching.dropArea()).isEqualTo("Kondapur");

        UUID tripId = accept(near);
        OpsTrip assigned = single();
        assertThat(assigned.state()).isEqualTo("ASSIGNED");
        assertThat(assigned.riderId()).isEqualTo(near);
        assertThat(assigned.riderName()).isEqualTo("Ravi Kumar");

        UUID threePl = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET provider = 'PIDGE' WHERE id = ?", threePl);
        UUID job = UUID.randomUUID();
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "SELECT ?, chef_sub_order_id, order_id, 'pidge', 'P-1', 'IN_TRANSIT' FROM fleet_schema.trip WHERE id = ?", job, threePl);
        assertThat(service.trips().trips()).extracting(OpsTrip::tripId, OpsTrip::provider, OpsTrip::state)
            .containsExactly(org.assertj.core.groups.Tuple.tuple(tripId, "CRAVES_FLEET", "ASSIGNED"),
                org.assertj.core.groups.Tuple.tuple(threePl, "PIDGE", "PICKED_UP"));

        fleet.db.update("UPDATE delivery_schema.delivery_job SET status = 'DELIVERED' WHERE id = ?", job);
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'DELIVERED', finished_at = now() WHERE id = ?", tripId);
        assertThat(service.trips().trips()).as("delivered by a rider or by Pidge: finished").isEmpty();
    }

    @Test
    void handingASearchingOrderToOneRiderClosesTheFleetStageAndBooksOnlyThatRider() {
        UUID tripId = tripId();
        UUID key = UUID.randomUUID();
        OpsTrip trip = (OpsTrip) service.reassign(ops, key, tripId, new ReassignInput(other, null, "Ravi is at the kitchen already"));

        assertThat(trip.state()).isEqualTo("ASSIGNED");
        assertThat(trip.riderId()).isEqualTo(other);
        assertThat(stages(tripId)).containsExactly("CRAVES_FLEET:CLOSED:OPS_ASSIGNED");
        assertThat(fleet.db.queryForList("SELECT rider_id || ':' || state FROM fleet_schema.trip_offer WHERE trip_id = ? ORDER BY offered_at, state",
            String.class, tripId)).containsExactlyInAnyOrder(near + ":WITHDRAWN", other + ":WITHDRAWN", other + ":ACCEPTED");
        Map<String, Object> locked = fleet.db.queryForMap("SELECT pay_paise, pickup_distance_m, rate_card_version FROM fleet_schema.trip WHERE id = ?", tripId);
        assertThat((Long) locked.get("pay_paise")).isPositive();
        assertThat(fleet.db.queryForObject("SELECT provider_id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", String.class,
            chefSubOrderId)).isEqualTo("craves_fleet");
        assertThat(commandStatus()).isEqualTo("COMPLETED");

        // The rider who was offered it first is too late, and the same key again is the first answer, not a second booking.
        UUID offer = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip_offer WHERE rider_id = ? AND trip_id = ?", UUID.class, near, tripId);
        refused(() -> new TransactionTemplate(fleet.transactions).execute(status -> trips.accept(identity(near), offer, "k")), 409, "OFFER_TAKEN");
        JsonNode replay = json.valueToTree(service.reassign(ops, key, tripId, new ReassignInput(other, null, "Ravi is at the kitchen already")));
        assertThat(replay.get("riderId").asText()).isEqualTo(other.toString());
        assertThat(replay.get("state").asText()).isEqualTo("ASSIGNED");
        refused(() -> service.reassign(ops, key, tripId, new ReassignInput(near, null, "Changed my mind")), 409, "IDEMPOTENCY_KEY_REUSED");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'TRIP_REASSIGNED' AND rider_id = ?",
            Integer.class, other)).isEqualTo(1);
    }

    @Test
    void aRiderWhoCannotTakeItIsRefusedAndNothingChanges() {
        UUID tripId = tripId();
        FleetDispatchFixtures.fix(fleet.db, other, KITCHEN_LAT, KITCHEN_LNG, 120, false);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Closest rider")), 409, "RIDER_NOT_AVAILABLE");
        FleetDispatchFixtures.fix(fleet.db, other, KITCHEN_LAT, KITCHEN_LNG, 5, true);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Closest rider")), 409, "RIDER_NOT_AVAILABLE");
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, "PIDGE", "Both")), 400, "VALIDATION_FAILED");
        refused(() -> service.reassign(ops, UUID.randomUUID(), UUID.randomUUID(), new ReassignInput(null, "PIDGE", "Nobody")), 404, "TRIP_NOT_FOUND");
        assertThat(stages(tripId)).containsExactly("CRAVES_FLEET:OPEN:");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer WHERE state = 'ACTIVE'", Integer.class)).isEqualTo(2);
    }

    @Test
    void aRiderIsNeverGivenATripOnADraftOrNotYetStartedRateCard() {
        UUID tripId = tripId();
        // Published cards never change, so the fixture's card is moved with its trigger off, as in FleetSetupDatabaseTest.
        rateCard("effective_from = now() + INTERVAL '20 days'");
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Closest rider")), 409, "RATE_CARD_REQUIRED");
        rateCard("status = 'DRAFT', published_at = NULL, effective_from = now() - INTERVAL '1 day'");
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Closest rider")), 409, "RATE_CARD_REQUIRED");
        assertThat(single().state()).as("nothing changed").isEqualTo("SEARCHING");
        assertThat(stages(tripId)).containsExactly("CRAVES_FLEET:OPEN:");
    }

    @Test
    void handingARiderTripToPidgeReleasesTheRiderWithPayForTheTripSoFar() {
        UUID tripId = accept(near);
        events.clear();
        OpsTrip trip = (OpsTrip) service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(null, "PIDGE", "Rider's bike broke down"));

        assertThat(trip.provider()).isEqualTo("PIDGE");
        assertThat(trip.state()).isEqualTo("SEARCHING");
        assertThat(trip.riderId()).isNull();
        assertThat(stages(tripId)).containsExactly("CRAVES_FLEET:CLOSED:ACCEPTED", "PIDGE:OPEN:");
        Map<String, Object> released = fleet.db.queryForMap("SELECT state, pay_held, final_pay_paise, cancel_reason FROM fleet_schema.trip WHERE id = ?", tripId);
        assertThat(released.get("state")).isEqualTo("CANCELLED");
        assertThat(released.get("pay_held")).isEqualTo(false);
        assertThat((String) released.get("cancel_reason")).doesNotContain("bike");
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, paid -> {
            assertThat(paid.riderId()).isEqualTo(near);
            assertThat(paid.held()).isFalse();
        });
        // The dispatch tick books Pidge for the rider's delivery job; nothing tells the customer the delivery was cancelled.
        verify(statusUpdates, never()).processTracking(any(), any());
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_outbox", Integer.class)).as("COURIER_ASSIGNED only").isOne();
    }

    @Test
    void anOrderWithItsFoodOnTheWayOrAlreadyWithARiderIsNotReassignedToAnotherRider() {
        UUID tripId = accept(near);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Swap riders")), 409, "TRIP_NOT_REASSIGNABLE");
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'PICKED_UP', picked_up_at = now() WHERE id = ?", tripId);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(null, "BORZO", "Too slow")), 409, "TRIP_NOT_REASSIGNABLE");
        assertThat(fleet.db.queryForObject("SELECT rider_id FROM fleet_schema.trip WHERE id = ?", UUID.class, tripId)).isEqualTo(near);
    }

    @Test
    void aQueuedOrderGoesToARiderOnlyWhenNoBookingIsInProgress() {
        UUID tripId = tripId();
        fleet.db.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = 'NO_ACCEPT', closed_at = now() WHERE trip_id = ?", tripId);
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now() WHERE trip_id = ?", tripId);
        fleet.db.update("UPDATE fleet_schema.trip SET provider = 'OPS_QUEUE' WHERE id = ?", tripId);
        dispatcher.openStage(tripId, "OPS_QUEUE", 86400);
        fleet.db.update("UPDATE delivery_schema.delivery_command SET status = 'PROCESSING' WHERE chef_sub_order_id = ?", chefSubOrderId);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(near, null, "Nobody took it")), 409, "TRIP_NOT_REASSIGNABLE");
        assertThat(stages(tripId)).endsWith("OPS_QUEUE:OPEN:");

        fleet.db.update("UPDATE delivery_schema.delivery_command SET status = 'DEAD_LETTER' WHERE chef_sub_order_id = ?", chefSubOrderId);
        OpsTrip trip = (OpsTrip) service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(near, null, "Nobody took it"));
        assertThat(trip.provider()).isEqualTo("CRAVES_FLEET");
        assertThat(trip.riderId()).isEqualTo(near);
        assertThat(stages(tripId)).containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "OPS_QUEUE:CLOSED:OPS_ASSIGNED", "CRAVES_FLEET:CLOSED:OPS_ASSIGNED");
        assertThat(commandStatus()).isEqualTo("COMPLETED");
        // The rider's steps reach the customer again: the latest stage is the fleet's.
        assertThat(new FleetStatusBridge(fleet.db, null, null, statusUpdates, json).snapshot(tripId).delivery().status())
            .isEqualTo(DeliveryStatus.COURIER_ASSIGNED);
    }

    @Test
    void cancellingARiderTripPaysByTheStateTableAndTellsThePipeline() {
        UUID tripId = accept(other);
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'AT_PICKUP', arrived_kitchen_at = now() WHERE id = ?", tripId);
        events.clear();
        OpsTrip trip = (OpsTrip) service.cancel(ops, UUID.randomUUID(), tripId, "Customer cancelled the order");

        assertThat(trip.state()).isEqualTo("CANCELLED");
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, paid -> {
            assertThat(paid.held()).isFalse();
            assertThat(paid.lines()).extracting("component").contains("cancellation", "pickup-km");
        });
        ArgumentCaptor<TrackingSnapshot> published = ArgumentCaptor.forClass(TrackingSnapshot.class);
        verify(statusUpdates).processTracking(any(), published.capture());
        assertThat(published.getValue().delivery().status()).isEqualTo(DeliveryStatus.CANCELLED);
        refused(() -> service.cancel(ops, UUID.randomUUID(), tripId, "Again"), 409, "TRIP_ALREADY_FINISHED");
    }

    @Test
    void cancellingASearchingOrderStopsTheChainWithoutBookingAnyone() {
        UUID tripId = tripId();
        OpsTrip trip = (OpsTrip) service.cancel(ops, UUID.randomUUID(), tripId, "Kitchen closed early");

        assertThat(trip.state()).isEqualTo("CANCELLED");
        assertThat(stages(tripId)).containsExactly("CRAVES_FLEET:CLOSED:OPS_CANCELLED");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer WHERE state = 'WITHDRAWN'", Integer.class)).isEqualTo(2);
        assertThat(commandStatus()).isEqualTo("DEAD_LETTER");
        assertThat(service.trips().trips()).isEmpty();
        assertThat(events).isEmpty();
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(null, "PIDGE", "Undo")), 409, "TRIP_NOT_REASSIGNABLE");
    }

    @Test
    void theDispatchQueueShowsQueuedOrdersOldestFirstWithTheirAttemptsAndHowUrgentTheyAre() {
        UUID chain = tripId();
        fleet.db.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = 'NO_ACCEPT', closed_at = now() - INTERVAL '9 minutes' "
            + "WHERE trip_id = ?", chain);
        stage(chain, 2, "PIDGE", "NO_COURIER", 8);
        queue(chain, 3, 7);
        UUID uncertain = fleet.trip(UUID.randomUUID());
        stage(uncertain, 1, "PIDGE", "UNCERTAIN_CREATE_PIDGE", 2);
        queue(uncertain, 2, 1);
        UUID fresh = fleet.trip(UUID.randomUUID());
        stage(fresh, 1, "BORZO", "NO_COURIER", 1);
        queue(fresh, 2, 0);
        UUID late = fleet.trip(UUID.randomUUID());
        stage(late, 1, "PIDGE", "NO_COURIER", 1);
        queue(late, 2, 0);
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "SELECT ?, chef_sub_order_id, order_id, 'pidge', 'P-9', 'COURIER_ASSIGNED' FROM fleet_schema.trip WHERE id = ?", UUID.randomUUID(), late);

        List<QueueItem> items = service.dispatchQueue().items();

        assertThat(items).extracting(QueueItem::tripId).containsExactly(chain, uncertain, fresh, late);
        assertThat(items).extracting(QueueItem::alertLevel).containsExactly("CRITICAL", "CRITICAL", "WARNING", "INFO");
        assertThat(items.get(0).attempts()).extracting(Attempt::provider, Attempt::outcome)
            .containsExactly(org.assertj.core.groups.Tuple.tuple("CRAVES_FLEET", "NO_ACCEPT"), org.assertj.core.groups.Tuple.tuple("PIDGE", "NO_COURIER"));
        assertThat(items.get(0).alertMessage()).contains("7 min");
        assertThat(items.get(1).alertMessage()).contains("Check Pidge");
        assertThat(items.get(3).alertMessage()).contains("Pidge courier took");
        assertThat(items.get(0).orderCode()).isEqualTo("#0BDE0101");
        assertThat(items).allSatisfy(item -> assertThat(item.alertMessage().length()).isLessThanOrEqualTo(300));
    }

    @Test
    void positionsAreEachRidersLatestFixFromTheLastTwelveHoursWithShiftTripAndMockFlags() {
        UUID tripId = accept(near);
        FleetDispatchFixtures.fix(fleet.db, other, KITCHEN_LAT, KITCHEN_LNG, 30, true);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET ended_at = now() WHERE rider_id = ?", other);
        UUID yesterday = fleet.rider("Old Fix", "+919800000003");
        FleetDispatchFixtures.fix(fleet.db, yesterday, KITCHEN_LAT, KITCHEN_LNG, 13 * 3600, false);

        List<Position> positions = service.positions().positions();

        assertThat(positions).extracting(Position::riderId).containsExactlyInAnyOrder(near, other);
        Position onTrip = positions.stream().filter(p -> p.riderId().equals(near)).findFirst().orElseThrow();
        assertThat(onTrip.onShift()).isTrue();
        assertThat(onTrip.onTrip()).isTrue();
        assertThat(onTrip.tripId()).isEqualTo(tripId);
        assertThat(onTrip.mock()).isFalse();
        assertThat(onTrip.riderName()).isEqualTo("Ravi Kumar");
        assertThat(onTrip.lat()).isEqualTo(KITCHEN_LAT);
        Position off = positions.stream().filter(p -> p.riderId().equals(other)).findFirst().orElseThrow();
        assertThat(off.onShift()).isFalse();
        assertThat(off.onTrip()).isFalse();
        assertThat(off.tripId()).isNull();
        assertThat(off.mock()).isTrue();
        assertThat(off.ageSeconds()).isBetween(30L, 90L);
        assertThat(Position.class.getRecordComponents()).extracting(java.lang.reflect.RecordComponent::getName)
            .as("the rider's own fix only, never the customer's").containsExactly("riderId", "riderName", "lat", "lng", "recordedAt",
                "ageSeconds", "onShift", "onTrip", "tripId", "mock");
    }

    private void stage(UUID tripId, int seq, String provider, String outcome, int minutesAgo) {
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, state, outcome, opened_at, deadline_at, closed_at) "
            + "VALUES (?, ?, ?, ?, 'CLOSED', ?, now() - make_interval(mins => ?) - INTERVAL '2 minutes', now() - make_interval(mins => ?) "
            + "- INTERVAL '1 minute', now() - make_interval(mins => ?))", UUID.randomUUID(), tripId, seq, provider, outcome, minutesAgo, minutesAgo,
            minutesAgo);
    }

    private void queue(UUID tripId, int seq, int minutesAgo) {
        fleet.db.update("UPDATE fleet_schema.trip SET provider = 'OPS_QUEUE' WHERE id = ? AND rider_id IS NULL", tripId);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, opened_at, deadline_at) VALUES (?, ?, ?, 'OPS_QUEUE', "
            + "now() - make_interval(mins => ?) - make_interval(secs => ?), now() + INTERVAL '1 day')", UUID.randomUUID(), tripId, seq, minutesAgo, seq);
    }

    private UUID accept(UUID rider) {
        UUID offer = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip_offer WHERE rider_id = ? AND state = 'ACTIVE'", UUID.class, rider);
        return UUID.fromString(new TransactionTemplate(fleet.transactions)
            .execute(status -> trips.accept(identity(rider), offer, "rider-accept-" + offer + "-" + rider)).tripId());
    }

    private UUID identity(UUID rider) {
        return fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, rider);
    }

    private UUID tripId() {
        return fleet.db.queryForObject("SELECT id FROM fleet_schema.trip WHERE chef_sub_order_id = ?", UUID.class, chefSubOrderId);
    }

    private OpsTrip single() {
        List<OpsTrip> all = service.trips().trips();
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    private List<String> stages(UUID tripId) {
        return fleet.db.queryForList("SELECT provider || ':' || state || ':' || COALESCE(outcome, '') FROM fleet_schema.trip_stage "
            + "WHERE trip_id = ? ORDER BY seq", String.class, tripId);
    }

    private String commandStatus() {
        return fleet.db.queryForObject("SELECT status FROM delivery_schema.delivery_command WHERE chef_sub_order_id = ?", String.class, chefSubOrderId);
    }

    private void rateCard(String set) {
        new TransactionTemplate(fleet.transactions).executeWithoutResult(status -> {
            fleet.db.execute("ALTER TABLE fleet_schema.rate_card DISABLE TRIGGER rate_card_notice");
            fleet.db.update("UPDATE fleet_schema.rate_card SET " + set + " WHERE version = '2026-10-v1'");
            fleet.db.execute("ALTER TABLE fleet_schema.rate_card ENABLE TRIGGER rate_card_notice");
        });
    }

    private static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
