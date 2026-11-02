package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
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
import in.craves.integration.fleet.dispatch.FleetOpsService.CodeCheckInput;
import in.craves.integration.fleet.dispatch.FleetOpsService.OpsTrip;
import in.craves.integration.fleet.dispatch.FleetOpsService.Position;
import in.craves.integration.fleet.dispatch.FleetOpsService.QueueItem;
import in.craves.integration.fleet.dispatch.FleetOpsService.ReassignInput;
import in.craves.integration.fleet.trip.FleetStatusBridge;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import in.craves.integration.fleet.trip.FleetTripService;
import in.craves.integration.payout.bank.BankDataCipher;
import java.time.Instant;
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
    final RiderPushClient alerts = mock(RiderPushClient.class);
    final DeliveryProviderAdapter borzo = mock(DeliveryProviderAdapter.class);
    FleetDispatcher dispatcher;
    FleetTripService trips;
    FleetOpsService service;
    /** The same, with craves.fleet.rider-handover-enabled on. */
    FleetOpsService handover;
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
        trips = new FleetTripService(fleet.db, pay, bridge, json, mock(DeliveryCodeClient.class), mock(FleetStorage.class), fleet.transactions,
            alerts);
        FleetAdminService admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class));
        when(borzo.providerId()).thenReturn("borzo");
        FleetCourierCancel couriers = new FleetCourierCancel(fleet.db, List.of(borzo), statusUpdates, alerts);
        service = new FleetOpsService(fleet.db, fleet.transactions, policies, testMode, dispatcher, trips, pay, bridge, admin, couriers, false);
        handover = new FleetOpsService(fleet.db, fleet.transactions, policies, testMode, dispatcher, trips, pay, bridge, admin, couriers, true);
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
        FleetDispatchFixtures.seen(fleet.db, other, 50);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Closest rider")), 409, "RIDER_NOT_AVAILABLE");
        FleetDispatchFixtures.seen(fleet.db, other, 5);
        FleetDispatchFixtures.fix(fleet.db, other, KITCHEN_LAT, KITCHEN_LNG, 200, false);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Closest rider")), 409, "RIDER_NOT_AVAILABLE");
        FleetDispatchFixtures.fix(fleet.db, other, KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET can_ring = false WHERE rider_id = ?", other);
        refused(() -> service.reassign(ops, UUID.randomUUID(), tripId, new ReassignInput(other, null, "Closest rider")), 409, "RIDER_NOT_AVAILABLE");
        fleet.db.update("UPDATE fleet_schema.rider_shift SET can_ring = NULL WHERE rider_id = ?", other);
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
    void aHeldTripGoesToAnotherRiderOnANewTripAndTheFirstRiderIsPaidForTheTripSoFar() throws Exception {
        UUID first = accept(other);
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'AT_PICKUP', arrived_kitchen_at = now() WHERE id = ?", first);
        refused(() -> handover.reassign(ops, UUID.randomUUID(), first, new ReassignInput(near, null, "Too early")), 409, "TRIP_NOT_REASSIGNABLE");
        contractMigration();
        events.clear();
        UUID key = UUID.randomUUID();
        OpsTrip moved = (OpsTrip) handover.reassign(ops, key, first, new ReassignInput(near, null, "Ravi's bike broke down"));

        UUID second = moved.tripId();
        assertThat(second).isNotEqualTo(first);
        assertThat(moved.state()).isEqualTo("ASSIGNED");
        assertThat(moved.riderId()).isEqualTo(near);
        // The first trip stays the first rider's pay record: released at the kitchen, paid, not held, and replaced.
        Map<String, Object> old = fleet.db.queryForMap("SELECT state, cancel_reason, pay_held, replaced_at FROM fleet_schema.trip WHERE id = ?", first);
        assertThat(old.get("state")).isEqualTo("CANCELLED");
        assertThat(old.get("cancel_reason")).isEqualTo(FleetOpsService.HANDED_TO_RIDER);
        assertThat(old.get("pay_held")).isEqualTo(false);
        assertThat(old.get("replaced_at")).isNotNull();
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, paid -> {
            assertThat(paid.riderId()).isEqualTo(other);
            assertThat(paid.held()).isFalse();
            assertThat(paid.lines()).extracting("component").contains("cancellation", "pickup-km");
        });
        // The order carries on in the new trip, with the second rider's own locked pay and accepted offer.
        Map<String, Object> next = fleet.db.queryForMap("SELECT chef_sub_order_id, replaces, pay_paise, accepted_at FROM fleet_schema.trip "
            + "WHERE id = ?", second);
        assertThat(next.get("chef_sub_order_id")).isEqualTo(chefSubOrderId);
        assertThat(next.get("replaces")).isEqualTo(first);
        assertThat((Long) next.get("pay_paise")).isPositive();
        assertThat(next.get("accepted_at")).isNotNull();
        assertThat(fleet.db.queryForList("SELECT rider_id || ':' || state FROM fleet_schema.trip_offer WHERE trip_id = ?", String.class, second))
            .containsExactly(near + ":ACCEPTED");
        assertThat(stages(second)).containsExactly("CRAVES_FLEET:CLOSED:OPS_ASSIGNED");
        assertThat(service.trips().trips()).extracting(OpsTrip::tripId).containsExactly(second);
        // The delivery job follows the new trip, and the order hears of a rider-to-rider handoff with the new rider's card.
        assertThat(fleet.db.queryForObject("SELECT provider_delivery_id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?",
            String.class, chefSubOrderId)).isEqualTo(second.toString());
        JsonNode handoff = json.readTree(fleet.db.queryForObject("SELECT (payload -> 'data')::text FROM delivery_schema.delivery_outbox "
            + "WHERE payload -> 'data' ->> 'handoffFromProviderId' = 'craves_fleet'", String.class));
        assertThat(handoff.get("status").asText()).isEqualTo("COURIER_ASSIGNED");
        assertThat(handoff.get("providerId").asText()).isEqualTo("craves_fleet");
        assertThat(handoff.get("providerDeliveryId").asText()).isEqualTo(second.toString());
        assertThat(handoff.get("handoffFromProviderDeliveryId").asText()).isEqualTo(first.toString());
        assertThat(handoff.get("courierName").asText()).isEqualTo("Ravi K.");
        // Each rider's app: the first has no trip and their late step is refused; the second rider's steps reach the order.
        assertThat(trips.active(identity(other))).isEmpty();
        assertThat(trips.active(identity(near))).hasValueSatisfying(trip -> assertThat(trip.tripId()).isEqualTo(second.toString()));
        refused(() -> trips.step(identity(other), first, "picked-up", "late-step"), 409, "TRIP_NOT_ACTIVE");
        trips.step(identity(near), second, "arrived-pickup", "second-arrived");
        ArgumentCaptor<TrackingSnapshot> published = ArgumentCaptor.forClass(TrackingSnapshot.class);
        verify(statusUpdates).processTracking(any(), published.capture());
        assertThat(published.getValue().delivery().providerDeliveryId()).isEqualTo(second.toString());
        assertThat(published.getValue().delivery().status()).isEqualTo(DeliveryStatus.AT_PICKUP);
        // The same key again is the first answer; the replaced trip can't be moved or cancelled any more.
        assertThat(json.valueToTree(handover.reassign(ops, key, first, new ReassignInput(near, null, "Ravi's bike broke down")))
            .get("tripId").asText()).isEqualTo(second.toString());
        refused(() -> handover.reassign(ops, UUID.randomUUID(), first, new ReassignInput(null, "PIDGE", "Again")), 409, "TRIP_CHANGED");
        refused(() -> handover.cancel(ops, UUID.randomUUID(), first, "Again"), 409, "TRIP_CHANGED");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip WHERE chef_sub_order_id = ?", Integer.class, chefSubOrderId))
            .isEqualTo(2);
    }

    /** P2-05: the chef handed this rider the food, so another rider or a courier would find an empty kitchen. */
    @Test
    void aTripTheChefHandedOverIsNotMovedToAnotherRiderOrACourier() {
        contractMigration();
        UUID first = accept(near);
        FleetDispatchFixtures.seen(fleet.db, other, 5);
        fleet.db.update("UPDATE fleet_schema.trip SET chef_handed_over_at = now() WHERE id = ?", first);
        refused(() -> handover.reassign(ops, UUID.randomUUID(), first, new ReassignInput(other, null, "Swap riders")), 409, "TRIP_NOT_REASSIGNABLE");
        refused(() -> handover.reassign(ops, UUID.randomUUID(), first, new ReassignInput(null, "BORZO", "Too slow")), 409, "TRIP_NOT_REASSIGNABLE");
        assertThat(fleet.db.queryForMap("SELECT state, rider_id FROM fleet_schema.trip WHERE id = ?", first))
            .containsEntry("state", "ASSIGNED").containsEntry("rider_id", near);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_stage WHERE trip_id = ? AND state = 'OPEN'", Integer.class, first))
            .isZero();
    }

    @Test
    void aHeldTripStaysWithItsRiderWhenTheOtherRiderCannotTakeItOrTheFoodIsPickedUp() {
        contractMigration();
        UUID first = accept(near);
        FleetDispatchFixtures.seen(fleet.db, other, 50);
        refused(() -> handover.reassign(ops, UUID.randomUUID(), first, new ReassignInput(other, null, "Swap riders")), 409, "RIDER_NOT_AVAILABLE");
        FleetDispatchFixtures.seen(fleet.db, other, 5);
        refused(() -> handover.reassign(ops, UUID.randomUUID(), first, new ReassignInput(near, null, "Same rider")), 409, "RIDER_NOT_AVAILABLE");
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'PICKED_UP', picked_up_at = now() WHERE id = ?", first);
        refused(() -> handover.reassign(ops, UUID.randomUUID(), first, new ReassignInput(other, null, "Swap riders")), 409, "TRIP_NOT_REASSIGNABLE");

        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip WHERE chef_sub_order_id = ?", Integer.class, chefSubOrderId))
            .as("nothing changed").isOne();
        assertThat(fleet.db.queryForObject("SELECT rider_id FROM fleet_schema.trip WHERE id = ?", UUID.class, first)).isEqualTo(near);
        assertThat(fleet.db.queryForObject("SELECT provider_delivery_id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?",
            String.class, chefSubOrderId)).isEqualTo(first.toString());
        assertThat(events.stream().filter(FleetTripPayFinalized.class::isInstance)).isEmpty();
    }

    @Test
    void aRefusedCodeTypedOfflineWaitsForOpsWhoRecordThatTheCustomerHasTheFood() {
        UUID tripId = refusedOfflineCode(false);
        refused(() -> service.checkCode(ops, UUID.randomUUID(), tripId, new CodeCheckInput("DELIVERED", "Customer has the food")), 409,
            "NO_CODE_CHECK");
        assertThat(service.codeChecks().items()).as("a code typed at the door is the rider's to retry").isEmpty();
        alerted(tripId);
        assertThat(service.codeChecks().items()).singleElement().satisfies(check -> {
            assertThat(check.tripId()).isEqualTo(tripId);
            assertThat(check.orderCode()).isEqualTo("#0BDE0101");
            assertThat(check.riderId()).isEqualTo(near);
            assertThat(check.riderName()).isEqualTo("Ravi Kumar");
            assertThat(check.wrongCodes()).isOne();
        });
        events.clear();

        OpsTrip trip = (OpsTrip) service.checkCode(ops, UUID.randomUUID(), tripId, new CodeCheckInput("DELIVERED", "Customer has the food"));

        assertThat(trip.state()).isEqualTo("DELIVERED");
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, paid -> {
            assertThat(paid.riderId()).isEqualTo(near);
            assertThat(paid.held()).isFalse();
            assertThat(paid.lines()).extracting("component").contains("base", "drop-km");
        });
        ArgumentCaptor<TrackingSnapshot> published = ArgumentCaptor.forClass(TrackingSnapshot.class);
        verify(statusUpdates).processTracking(any(), published.capture());
        assertThat(published.getValue().delivery().status()).isEqualTo(DeliveryStatus.DELIVERED);
        assertThat(service.codeChecks().items()).isEmpty();
        assertThat(trips.active(identity(near))).as("the rider can take orders again").isEmpty();
        refused(() -> service.checkCode(ops, UUID.randomUUID(), tripId, new CodeCheckInput("NOT_DELIVERED", "Changed my mind")), 409,
            "NO_CODE_CHECK");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'OFFLINE_CODE_CHECKED' AND rider_id = ?",
            Integer.class, near)).isOne();
    }

    @Test
    void aCustomerWithoutTheFoodFailsTheTripAndHoldsThePayWhileOpsChecksWithTheRider() {
        UUID tripId = refusedOfflineCode(true);
        refused(() -> service.checkCode(ops, UUID.randomUUID(), tripId, new CodeCheckInput("MAYBE", "Customer unsure")), 400, "VALIDATION_FAILED");
        refused(() -> service.checkCode(ops, UUID.randomUUID(), tripId, new CodeCheckInput("DELIVERED", " ")), 400, "VALIDATION_FAILED");
        events.clear();

        OpsTrip trip = (OpsTrip) service.checkCode(ops, UUID.randomUUID(), tripId, new CodeCheckInput("NOT_DELIVERED", "Customer got nothing"));

        assertThat(trip.state()).isEqualTo("FAILED");
        Map<String, Object> row = fleet.db.queryForMap("SELECT cancel_reason, pay_held, hold_reason FROM fleet_schema.trip WHERE id = ?", tripId);
        assertThat(row.get("cancel_reason")).isEqualTo(FleetTripService.NOT_RECEIVED);
        assertThat(row.get("pay_held")).isEqualTo(true);
        assertThat(row.get("hold_reason")).isEqualTo(FleetTripService.NOT_RECEIVED_HOLD);
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, paid -> assertThat(paid.held()).isTrue());
        ArgumentCaptor<TrackingSnapshot> published = ArgumentCaptor.forClass(TrackingSnapshot.class);
        verify(statusUpdates).processTracking(any(), published.capture());
        assertThat(published.getValue().delivery().status()).isEqualTo(DeliveryStatus.FAILED);
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
        if (fleet.db.update("UPDATE fleet_schema.rider_device SET fcm_token = 'token-other' WHERE rider_id = ? AND state = 'BOUND'", other) == 0) {
            fleet.db.update("INSERT INTO fleet_schema.rider_device (id, rider_id, fcm_token, app_version, model, state) "
                + "VALUES (?, ?, 'token-other', '1.3.0', 'Redmi 13C', 'BOUND')", UUID.randomUUID(), other);
        }
        events.clear();
        OpsTrip trip = (OpsTrip) service.cancel(ops, UUID.randomUUID(), tripId, "Customer cancelled the order");
        // The rider hears at once, once the cancel has committed (R16 item 11), not on the next /locations call.
        verify(alerts, timeout(5_000)).tripEnded("token-other", tripId, "CANCELLED");

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

    /**
     * R16 item 11: an order Borzo holds is cancelled with Borzo first, outside the transaction. While Borzo refuses (their
     * courier may have the food) the delivery stays as it is and ops reads why; once Borzo cancels, the delivery ends, once.
     */
    @Test
    void cancellingAnOrderBorzoHoldsCancelsTheirCourierFirstAndSaysWhyWhenTheyRefuse() {
        UUID tripId = tripId();
        fleet.db.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = 'NO_ACCEPT', closed_at = now() WHERE trip_id = ?", tripId);
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now() WHERE trip_id = ?", tripId);
        fleet.db.update("UPDATE fleet_schema.trip SET provider = 'BORZO' WHERE id = ?", tripId);
        stage(tripId, 2, "BORZO", "ASSIGNED", 1);
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, 'borzo', 'B-7', 'COURIER_ASSIGNED')", UUID.randomUUID(), chefSubOrderId, command.orderId());
        fleet.db.update("UPDATE delivery_schema.delivery_command SET status = 'COMPLETED' WHERE chef_sub_order_id = ?", chefSubOrderId);
        when(borzo.cancel("B-7")).thenThrow(new IllegalStateException("Borzo cancel-order was rejected"))
            .thenReturn(new ProviderDelivery("borzo", "B-7", "B-7", DeliveryStatus.CANCELLED, "canceled", null, null, null, null, Instant.now()));

        assertThatThrownBy(() -> service.cancel(ops, UUID.randomUUID(), tripId, "Customer called to cancel"))
            .isInstanceOfSatisfying(FleetApiException.class, error -> {
                assertThat(error.status()).isEqualTo(409);
                assertThat(error.code()).isEqualTo("TRIP_NOT_CANCELLABLE");
                assertThat(error.getMessage()).contains("Borzo didn't cancel delivery B-7", "rejected", "call Borzo");
            });
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE id = ?", String.class, tripId)).isEqualTo("SEARCHING");
        assertThat(fleet.db.queryForMap("SELECT reason, attempts, last_error, cancelled_at, requested_by, requested_by_name "
            + "FROM delivery_schema.courier_cancel WHERE provider_delivery_id = 'B-7'")).containsEntry("reason", "OPS_CANCELLED")
            .containsEntry("attempts", 1).containsEntry("last_error", "Borzo cancel-order was rejected").containsEntry("cancelled_at", null)
            .as("Borzo is called before the audited transaction, so the row says who asked")
            .containsEntry("requested_by", ops.id()).containsEntry("requested_by_name", ops.name());
        refused(() -> service.cancel(ops, UUID.randomUUID(), tripId, "Customer called to cancel"), 409, "TRIP_NOT_CANCELLABLE");
        verify(borzo, times(1)).cancel("B-7"); // tried again only after a minute: a call never overlaps another

        fleet.db.update("UPDATE delivery_schema.courier_cancel SET last_attempt_at = now() - INTERVAL '61 seconds' WHERE provider_delivery_id = 'B-7'");
        Admin retry = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx321");
        service.cancel(retry, UUID.randomUUID(), tripId, "Customer called to cancel");

        verify(borzo, times(2)).cancel("B-7");
        assertThat(fleet.db.queryForMap("SELECT cancelled_at IS NOT NULL AS cancelled, requested_by, requested_by_name "
            + "FROM delivery_schema.courier_cancel WHERE provider_delivery_id = 'B-7'")).containsEntry("cancelled", true)
            .as("the admin whose retry called Borzo").containsEntry("requested_by", retry.id()).containsEntry("requested_by_name", retry.name());
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE id = ?", String.class, tripId)).isEqualTo("CANCELLED");
        assertThat(stages(tripId)).containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "BORZO:CLOSED:ASSIGNED");
        ArgumentCaptor<TrackingSnapshot> applied = ArgumentCaptor.forClass(TrackingSnapshot.class);
        verify(statusUpdates).processTracking(any(), applied.capture());
        assertThat(applied.getValue().delivery().status()).as("the job and order-service hear it at once").isEqualTo(DeliveryStatus.CANCELLED);
        refused(() -> service.cancel(ops, UUID.randomUUID(), tripId, "Again"), 409, "TRIP_ALREADY_FINISHED");
        verify(borzo, times(2)).cancel("B-7");
        verify(alerts, never()).opsAlert(any(), any(), any(), any());
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

    /** Location only while working (blueprint E6): ops sees riders on shift or on a trip, and nobody else. */
    @Test
    void positionsAreOnlyOfRidersOnShiftOrOnATripWithTheirTripAndMockFlags() {
        UUID tripId = accept(near);
        FleetDispatchFixtures.fix(fleet.db, other, KITCHEN_LAT, KITCHEN_LNG, 30, true);
        UUID wentHome = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET ended_at = now() WHERE rider_id = ?", wentHome);
        UUID yesterday = fleet.rider("Old Fix", "+919800000004");
        FleetDispatchFixtures.fix(fleet.db, yesterday, KITCHEN_LAT, KITCHEN_LNG, 13 * 3600, false);

        List<Position> positions = service.positions().positions();

        assertThat(positions).as("off shift and off a trip: not shown").extracting(Position::riderId).containsExactlyInAnyOrder(near, other);
        Position onTrip = positions.stream().filter(p -> p.riderId().equals(near)).findFirst().orElseThrow();
        assertThat(onTrip.onShift()).isTrue();
        assertThat(onTrip.onTrip()).isTrue();
        assertThat(onTrip.tripId()).isEqualTo(tripId);
        assertThat(onTrip.mock()).isFalse();
        assertThat(onTrip.riderName()).isEqualTo("Ravi Kumar");
        assertThat(onTrip.lat()).isEqualTo(KITCHEN_LAT);
        Position waiting = positions.stream().filter(p -> p.riderId().equals(other)).findFirst().orElseThrow();
        assertThat(waiting.onShift()).isTrue();
        assertThat(waiting.onTrip()).isFalse();
        assertThat(waiting.tripId()).isNull();
        assertThat(waiting.mock()).isTrue();
        assertThat(waiting.ageSeconds()).isBetween(30L, 90L);
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

    /** What the contract migration after V166 does once no older image can run: one trip per order is no longer a constraint. */
    private void contractMigration() {
        fleet.db.execute("ALTER TABLE fleet_schema.trip DROP CONSTRAINT IF EXISTS trip_chef_sub_order_id_key");
    }

    /** near's trip at the drop with one code order-service refused; alerted: it was typed offline (alertIfTypedOffline). */
    private UUID refusedOfflineCode(boolean alerted) {
        UUID tripId = accept(near);
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'AT_DROP', picked_up_at = now() - INTERVAL '20 minutes', "
            + "arrived_drop_at = now() - INTERVAL '2 minutes' WHERE id = ?", tripId);
        fleet.db.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, actor_id, idempotency_key, detail) "
            + "VALUES (?, ?, 'OTP_INVALID', 'RIDER', ?, 'otp-1', '{\"attemptsLeft\": 4}')", UUID.randomUUID(), tripId, near);
        if (alerted) {
            alerted(tripId);
        }
        return tripId;
    }

    private void alerted(UUID tripId) {
        fleet.db.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, idempotency_key) "
            + "VALUES (?, ?, 'OFFLINE_OTP_ALERTED', 'SYSTEM', 'offline-otp-alert')", UUID.randomUUID(), tripId);
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
