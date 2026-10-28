package in.craves.integration.fleet.trip;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.DeliveryCodeClient;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.fleet.dispatch.FleetDispatcher;
import in.craves.integration.fleet.engine.FleetEngineFeed;
import in.craves.integration.fleet.rider.FleetShiftService;
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;

/** Offers (PLAN F9) against a real database: one conditional update decides the first accept. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetOfferDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final ExecutorService threads = Executors.newFixedThreadPool(2);
    FleetDispatcher dispatcher;
    FleetTripService trips;
    TransactionTemplate transaction;
    UUID chefSubOrderId;
    UUID first;
    UUID second;
    UUID firstIdentity;
    UUID secondIdentity;

    @BeforeEach
    void setUp() {
        FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies, new FleetTestMode(fleet.db, FleetDatabase.properties(true)),
            roads, mock(RiderPushClient.class), json);
        FleetStatusBridge bridge = new FleetStatusBridge(fleet.db, new DeliveryOutboxRepository(fleet.db, json),
            new DeliveryCommandRepository(fleet.db, json), mock(DeliveryStatusUpdateService.class), json);
        trips = new FleetTripService(fleet.db, new FleetTripPay(fleet.db, policies, json, event -> { }), bridge, json,
            mock(DeliveryCodeClient.class), mock(FleetStorage.class), fleet.transactions, mock(RiderPushClient.class));
        transaction = new TransactionTemplate(fleet.transactions);
        FleetDispatchFixtures.policy(fleet.db, "live");
        first = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        second = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.002, KITCHEN_LNG, 5, false);
        firstIdentity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, first);
        secondIdentity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, second);
        chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(chefSubOrderId), OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
    }

    @AfterEach
    void stop() {
        threads.shutdownNow();
    }

    @Test
    void twoAcceptsOnOneTripExactlyOneWins() throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Object>> results = new ArrayList<>();
        for (UUID[] rider : List.of(new UUID[] {first, firstIdentity}, new UUID[] {second, secondIdentity})) {
            UUID offer = offerOf(rider[0]);
            results.add(threads.submit((Callable<Object>) () -> {
                go.await();
                try {
                    return transaction.execute(status -> trips.accept(rider[1], offer, "rider-accept-" + offer + "-" + rider[0]));
                } catch (FleetApiException refused) {
                    return refused;
                }
            }));
        }
        go.countDown();
        List<Object> outcomes = new ArrayList<>();
        for (Future<Object> result : results) {
            outcomes.add(result.get());
        }

        assertThat(outcomes).filteredOn(Trip.class::isInstance).hasSize(1);
        assertThat(outcomes).filteredOn(FleetApiException.class::isInstance).singleElement()
            .satisfies(refused -> {
                assertThat(((FleetApiException) refused).status()).isEqualTo(409);
                assertThat(((FleetApiException) refused).code()).isEqualTo("OFFER_TAKEN");
            });
        Map<String, Object> trip = fleet.db.queryForMap("SELECT id, state, rider_id, pay_paise, accepted_at FROM fleet_schema.trip");
        assertThat(trip.get("state")).isEqualTo("ASSIGNED");
        assertThat(fleet.db.queryForList("SELECT state FROM fleet_schema.trip_offer ORDER BY state", String.class))
            .containsExactly("ACCEPTED", "LOST");
        assertThat(fleet.db.queryForList("SELECT state || ':' || outcome FROM fleet_schema.trip_stage", String.class))
            .containsExactly("CLOSED:ACCEPTED");
        UUID winner = (UUID) trip.get("rider_id");
        assertThat(fleet.db.queryForObject("SELECT rider_id FROM fleet_schema.trip_offer WHERE state = 'ACCEPTED'", UUID.class)).isEqualTo(winner);

        Map<String, Object> job = fleet.db.queryForMap("SELECT provider_id, provider_delivery_id, status FROM delivery_schema.delivery_job "
            + "WHERE chef_sub_order_id = ?", chefSubOrderId);
        assertThat(job).containsEntry("provider_id", "craves_fleet").containsEntry("provider_delivery_id", trip.get("id").toString())
            .containsEntry("status", "COURIER_ASSIGNED");
        JsonNode event = json.readTree(fleet.db.queryForObject("SELECT payload::text FROM delivery_schema.delivery_outbox", String.class));
        assertThat(event.path("data").path("providerId").asText()).isEqualTo("craves_fleet");
        assertThat(event.path("data").path("status").asText()).isEqualTo("COURIER_ASSIGNED");
        assertThat(event.path("data").path("courierName").asText()).isEqualTo("Ravi K.");
        assertThat(event.path("data").path("courierPhone").asText()).startsWith("+9198000000");
        assertThat(event.path("data").has("pickupEtaAt")).isTrue();

        UUID winnerIdentity = winner.equals(first) ? firstIdentity : secondIdentity;
        UUID loser = winner.equals(first) ? second : first;
        UUID loserIdentity = winner.equals(first) ? secondIdentity : firstIdentity;
        Trip again = transaction.execute(status -> trips.accept(winnerIdentity, offerOf(winner), "rider-accept-again"));
        assertThat(again.tripId()).as("the winner's repeat gets the first answer").isEqualTo(trip.get("id").toString());
        assertThat(again.step()).isEqualTo("TO_KITCHEN");
        assertThat(again.orderCode()).isEqualTo("#0BDE0101");
        assertThat(again.payLines()).isNotEmpty();
        refused(() -> transaction.execute(status -> trips.accept(loserIdentity, offerOf(loser), "rider-accept-again")), 409, "OFFER_TAKEN");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isEqualTo(1);
    }

    @Test
    void anAcceptAfterTheFleetStageClosedIsRefusedAndBooksNobody() {
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '61 seconds', deadline_at = now() - INTERVAL '1 second'");
        assertThat(dispatcher.run(FleetDispatchFixtures.command(chefSubOrderId), OptionalLong::empty, true)).isEmpty();

        refused(() -> transaction.execute(status -> trips.accept(firstIdentity, offerOf(first), "rider-accept-late")), 410, "OFFER_EXPIRED");
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip", String.class)).isEqualTo("SEARCHING");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();
    }

    @Test
    void anAcceptAtTheStageDeadlineIsRefusedEvenBeforeTheStageIsClosed() {
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '61 seconds', deadline_at = now() - INTERVAL '1 second'");
        refused(() -> transaction.execute(status -> trips.accept(firstIdentity, offerOf(first), "rider-accept-late")), 410, "OFFER_EXPIRED");
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_stage", String.class)).isEqualTo("OPEN");
    }

    @Test
    void anExpiredOfferIsGoneAndDecliningIsFreeAndChangesNothingElse() {
        fleet.db.update("UPDATE fleet_schema.trip_offer SET offered_at = now() - INTERVAL '41 seconds', expires_at = now() - INTERVAL '1 second' "
            + "WHERE rider_id = ?", first);
        refused(() -> transaction.execute(status -> trips.accept(firstIdentity, offerOf(first), "k1")), 410, "OFFER_EXPIRED");

        Map<String, Object> before = fleet.db.queryForMap("SELECT state, version, provider FROM fleet_schema.trip");
        trips.decline(secondIdentity, offerOf(second));
        trips.decline(secondIdentity, offerOf(second));
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_offer WHERE rider_id = ?", String.class, second))
            .isEqualTo("DECLINED");
        assertThat(fleet.db.queryForMap("SELECT state, version, provider FROM fleet_schema.trip")).isEqualTo(before);
        refused(() -> trips.decline(firstIdentity, offerOf(second)), 404, "OFFER_NOT_FOUND");
        refused(() -> transaction.execute(status -> trips.accept(secondIdentity, offerOf(second), "k2")), 410, "OFFER_EXPIRED");
    }

    @Test
    void withTheFleetEngineOnTheWinnerAndADeclinerAreReadAgainForIt() {
        FleetEngineFeed feed = mock(FleetEngineFeed.class);
        when(feed.on()).thenReturn(true);
        trips.setEngineFeed(feed);
        transaction.execute(status -> trips.accept(firstIdentity, offerOf(first), "rider-accept-engine"));
        verify(feed).refresh(first); // on a trip now: no other order is ranked as if the winner were free
        trips.decline(secondIdentity, offerOf(second));
        verify(feed).refresh(second);
    }

    @Test
    void anAcceptForACancelledOrderIsRefusedWithARiderSafeMessage() {
        fleet.refundRequested(chefSubOrderId);
        refused(() -> transaction.execute(status -> trips.accept(firstIdentity, offerOf(first), "rider-accept-1")), 409, "ORDER_CANCELLED");
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip", String.class))
            .as("refused before the dispatch tick ends the trip").isEqualTo("SEARCHING");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();
    }

    @Test
    void cancellingWhileRidersDecideWithdrawsTheOffersAndNobodyIsBooked() {
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        assertThat(trips.cancel(trip, "Cancelled by Craves ops.")).contains("CANCELLED");

        assertThat(fleet.db.queryForList("SELECT state FROM fleet_schema.trip_offer", String.class)).containsOnly("WITHDRAWN");
        assertThat(fleet.db.queryForList("SELECT state || ':' || outcome FROM fleet_schema.trip_stage", String.class))
            .containsExactly("CLOSED:CANCELLED");
        refused(() -> transaction.execute(status -> trips.accept(secondIdentity, offerOf(second), "rider-accept-2")), 409, "ORDER_CANCELLED");
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(chefSubOrderId), OptionalLong::empty, true))
            .as("the delivery command books no courier").isInstanceOf(IllegalStateException.class).hasMessageContaining("cancelled");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_stage", Integer.class)).isEqualTo(1);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();
        assertThat(trips.cancel(trip, "Again")).as("a second cancel changes nothing").contains("CANCELLED");
    }

    @Test
    void aCancelRacingAnAcceptWaitsForItInsteadOfDeadlocking() throws Exception {
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        UUID offer = offerOf(first);
        CountDownLatch stageHeld = new CountDownLatch(1);
        // An accept's locks in its order (FleetTripService.accept): the fleet stage, then the offer and the trip.
        Future<Object> accepting = threads.submit(() -> transaction.execute(status -> {
            fleet.db.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = 'ACCEPTED', closed_at = now() WHERE trip_id = ?", trip);
            stageHeld.countDown();
            try {
                Thread.sleep(500);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
            fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'ACCEPTED', decided_at = now() WHERE id = ?", offer);
            fleet.db.update("UPDATE fleet_schema.trip SET state = 'ASSIGNED', rider_id = ?, accepted_at = now(), pickup_distance_m = 200 "
                + "WHERE id = ?", first, trip);
            return null;
        }));
        assertThat(stageHeld.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();

        Future<Object> cancelling = threads.submit(() -> transaction.execute(status -> trips.cancel(trip, FleetTripService.ORDER_CANCELLED)));

        accepting.get(20, java.util.concurrent.TimeUnit.SECONDS);
        assertThat(cancelling.get(20, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(java.util.Optional.of("CANCELLED"));
        assertThat(fleet.db.queryForMap("SELECT state, rider_id, pay_finalized_at IS NOT NULL AS paid FROM fleet_schema.trip"))
            .containsEntry("state", "CANCELLED").containsEntry("rider_id", first).containsEntry("paid", true);
        assertThat(fleet.db.queryForList("SELECT state FROM fleet_schema.trip_offer ORDER BY state", String.class))
            .containsExactly("ACCEPTED", "WITHDRAWN");
    }

    @Test
    void goingOfflineWithdrawsTheOfferAndARiderWhoseShiftRanOutCannotAccept() {
        new FleetShiftService(fleet.db, FleetDatabase.properties(true), mock(FleetStorage.class)).end(firstIdentity);
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_offer WHERE rider_id = ?", String.class, first))
            .isEqualTo("WITHDRAWN");
        refused(() -> transaction.execute(status -> trips.accept(firstIdentity, offerOf(first), "rider-accept-1")), 410, "OFFER_EXPIRED");

        fleet.db.update("UPDATE fleet_schema.rider_shift SET credential_expires_at = now() - INTERVAL '1 second' WHERE rider_id = ?", second);
        refused(() -> transaction.execute(status -> trips.accept(secondIdentity, offerOf(second), "rider-accept-2")), 410, "OFFER_EXPIRED");
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_stage", String.class)).isEqualTo("OPEN");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();
    }

    @Test
    void onlyAnActiveRiderCanAccept() {
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'SUSPENDED' WHERE id = ?", first);
        refused(() -> transaction.execute(status -> trips.accept(firstIdentity, offerOf(first), "k1")), 403, "RIDER_NOT_ACTIVE");
        refused(() -> trips.decline(UUID.randomUUID(), offerOf(first)), 403, "NOT_A_RIDER");
    }

    private UUID offerOf(UUID rider) {
        return fleet.db.queryForObject("SELECT id FROM fleet_schema.trip_offer WHERE rider_id = ?", UUID.class, rider);
    }

    private static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
