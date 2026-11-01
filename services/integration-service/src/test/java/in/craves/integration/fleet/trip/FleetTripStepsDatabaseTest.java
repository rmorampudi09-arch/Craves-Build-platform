package in.craves.integration.fleet.trip;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import in.craves.integration.fleet.client.DeliveryCodeClient.Outcome;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.fleet.dispatch.FleetDispatcher;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import in.craves.integration.fleet.trip.FleetTripService.Tap;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionTemplate;

/** Trip steps and the delivery code (PLAN F9b) against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetTripStepsDatabaseTest {
    static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x00, 0x01};
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCodeClient codes = mock(DeliveryCodeClient.class);
    final FleetStorage storage = mock(FleetStorage.class);
    final RiderPushClient alerts = mock(RiderPushClient.class);
    final DeliveryStatusUpdateService statusUpdates = mock(DeliveryStatusUpdateService.class);
    final List<Object> events = new ArrayList<>();
    final AtomicInteger wrongCodes = new AtomicInteger();
    FleetTripService trips;
    UUID rider;
    UUID identity;
    UUID tripId;

    @BeforeEach
    void setUp() {
        FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        FleetDispatcher dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies,
            new FleetTestMode(fleet.db, FleetDatabase.properties(true)), roads, mock(RiderPushClient.class), json);
        FleetStatusBridge bridge = new FleetStatusBridge(fleet.db, new DeliveryOutboxRepository(fleet.db, json),
            new DeliveryCommandRepository(fleet.db, json), statusUpdates, json);
        trips = new FleetTripService(fleet.db, new FleetTripPay(fleet.db, policies, json, events::add), bridge, json, codes, storage,
            fleet.transactions, alerts);
        FleetDispatchFixtures.policy(fleet.db, "live");
        rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        identity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, rider);
        UUID chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(chefSubOrderId), OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        UUID offer = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip_offer", UUID.class);
        tripId = UUID.fromString(new TransactionTemplate(fleet.transactions)
            .execute(status -> trips.accept(identity, offer, "rider-accept-" + offer + "-" + rider)).tripId());
        // order-service's code check: 4821 is right; the fifth wrong code locks it.
        when(codes.verify(any(), anyString())).thenAnswer(call -> {
            if (wrongCodes.get() >= 5) {
                return new DeliveryCodeClient.Result(Outcome.LOCKED, 0);
            }
            if ("4821".equals(call.getArgument(1))) {
                return new DeliveryCodeClient.Result(Outcome.VERIFIED, 0);
            }
            return new DeliveryCodeClient.Result(Outcome.INVALID, 5 - wrongCodes.incrementAndGet());
        });
    }

    @Test
    void stepsRunInOrderEachIdempotentAndTheVersionMovesOn() {
        Trip assigned = trips.active(identity).orElseThrow();
        assertThat(assigned.step()).isEqualTo("TO_KITCHEN");
        assertThat(assigned.orderCode()).isEqualTo("#0BDE0101");
        assertThat(assigned.sealed()).as("orders carry no sealed flag yet").isFalse();
        assertThat(assigned.waitFreeSeconds()).isEqualTo(480);
        assertThat(assigned.unreachableWaitSeconds()).isEqualTo(600);
        assertThat(assigned.waitPayPerMinutePaise()).isEqualTo(150L);

        refused(() -> trips.step(identity, tripId, "arrived-drop", "k0"), 409, "STEP_CONFLICT");
        Trip atKitchen = trips.step(identity, tripId, "arrived-pickup", "rider-arrived-pickup-1");
        assertThat(atKitchen.step()).isEqualTo("AT_KITCHEN");
        assertThat(atKitchen.arrivedKitchenAt()).as("a fresh real fix inside the kitchen zone").isNotNull();
        assertThat(atKitchen.version()).isEqualTo(assigned.version() + 1);
        assertThat(trips.step(identity, tripId, "arrived-pickup", "rider-arrived-pickup-1").version()).isEqualTo(atKitchen.version());
        assertThat(trips.step(identity, tripId, "arrived-pickup", "another-key").version()).as("already there").isEqualTo(atKitchen.version());

        assertThat(trips.step(identity, tripId, "picked-up", "k2").step()).isEqualTo("PICKED_UP");
        refused(() -> trips.step(identity, tripId, "arrived-pickup", "k3"), 409, "STEP_CONFLICT");
        Trip atDrop = trips.step(identity, tripId, "arrived-drop", "k4");
        assertThat(atDrop.step()).isEqualTo("AT_DROP");
        assertThat(atDrop.version()).isEqualTo(atKitchen.version() + 2);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_event WHERE trip_id = ?", Integer.class, tripId))
            .isEqualTo(4); // accepted, arrived-pickup, picked-up, arrived-drop
        verify(statusUpdates, times(3)).processTracking(any(), any());
        refused(() -> trips.step(UUID.randomUUID(), tripId, "picked-up", "k5"), 403, "NOT_A_RIDER");
    }

    @Test
    void theFreeWaitStartsAtTheLaterOfAnArrivalInsideTheKitchenZoneAndTheChefsReadyTime() {
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT + 0.02, KITCHEN_LNG, 5, false); // 2.2 km away
        assertThat(trips.step(identity, tripId, "arrived-pickup", "k1").arrivedKitchenAt()).as("not inside the zone yet").isNull();
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT, KITCHEN_LNG, 5, true);
        assertThat(trips.step(identity, tripId, "food-not-ready", "k2").arrivedKitchenAt()).as("a mock fix never counts").isNull();
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        assertThat(trips.step(identity, tripId, "food-not-ready", "k3").arrivedKitchenAt()).isNotNull();

        // Arrived 20 minutes ago, food ready 15 minutes ago, handed over now: 7 paid minutes at ₹1.50.
        fleet.db.update("UPDATE fleet_schema.trip SET arrived_kitchen_at = now() - INTERVAL '20 minutes', "
            + "chef_ready_at = now() - INTERVAL '15 minutes' WHERE id = ?", tripId);
        trips.step(identity, tripId, "picked-up", "k4");
        trips.step(identity, tripId, "arrived-drop", "k5");
        Trip delivered = trips.deliveredByOtp(identity, tripId, "4821", "rider-delivered-1");

        assertThat(delivered.step()).isEqualTo("DELIVERED");
        assertThat(delivered.payLines()).extracting(PayLine::component).containsExactly("base", "drop-km", "waiting");
        assertThat(delivered.payLines()).filteredOn(line -> line.component().equals("waiting")).singleElement()
            .satisfies(line -> assertThat(line.amountPaise()).isBetween(1049L, 1051L));
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> {
            assertThat(event.held()).isFalse();
            assertThat(event.rateCardVersion()).isEqualTo("2026-10-v1");
            assertThat(event.lines()).isEqualTo(delivered.payLines());
        });
        assertThat(trips.deliveredByOtp(identity, tripId, "4821", "rider-delivered-2").step()).as("idempotent").isEqualTo("DELIVERED");
        assertThat(events).hasSize(1);
        assertThat(trips.active(identity)).isEmpty();
    }

    @Test
    void wrongCodesLockAfterFiveThenThePhotoDeliversWithPayHeldForOps() {
        toDrop();
        for (int left = 4; left >= 1; left--) {
            int expected = left;
            assertThatThrownBy(() -> trips.deliveredByOtp(identity, tripId, "1111", "rider-delivered-" + expected))
                .isInstanceOfSatisfying(FleetApiException.class, error -> {
                    assertThat(error.status()).isEqualTo(422);
                    assertThat(error.code()).isEqualTo("OTP_INVALID");
                    assertThat(error.attemptsLeft()).isEqualTo(expected);
                });
        }
        refused(() -> trips.deliveredByOtp(identity, tripId, "1111", "rider-delivered-0"), 423, "OTP_LOCKED");
        refused(() -> trips.deliveredByOtp(identity, tripId, "4821", "rider-delivered-after"), 423, "OTP_LOCKED");
        assertThatThrownBy(() -> trips.deliveredByOtp(identity, tripId, "1111", "rider-delivered-3"))
            .as("a repeated key gets its first answer").isInstanceOfSatisfying(FleetApiException.class,
                error -> assertThat(error.attemptsLeft()).isEqualTo(3));
        verify(codes, times(5)).verify(any(), anyString());

        Trip delivered = trips.deliveredByPhoto(identity, tripId, 0, new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG), "photo-1");

        assertThat(delivered.step()).as("allowed after the OTP lock, without the wait").isEqualTo("DELIVERED");
        assertThat(trips.deliveredByPhoto(identity, tripId, 0, null, "photo-1").step())
            .as("a retry whose answer was lost gets the trip, even without the photo (P1-07)").isEqualTo("DELIVERED");
        verify(storage).upload(startsWith("riders/" + rider + "/trips/" + tripId + "/delivery-"), eq(JPEG), eq("image/jpeg"), anyBoolean());
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> {
            assertThat(event.held()).isTrue();
            assertThat(event.holdReason()).isEqualTo(FleetTripService.PHOTO_HOLD);
        });
    }

    @Test
    void aCodeTypedOfflineThatIsRefusedAlertsOpsOncePerTrip() {
        toDrop();
        Tap offline = new Tap(90_000L, null, true);
        String offlineAlerts = "SELECT count(*) FROM fleet_schema.trip_event WHERE trip_id = ? AND kind = 'OFFLINE_OTP_ALERTED'";
        refused(() -> trips.deliveredByOtp(identity, tripId, "1111", "rider-delivered-1"), 422, "OTP_INVALID");
        assertThat(fleet.db.queryForObject(offlineAlerts, Integer.class, tripId)).as("typed at the door: the rider sees it").isZero();

        refused(() -> trips.deliveredByOtp(identity, tripId, "1111", "rider-delivered-2", offline), 422, "OTP_INVALID");
        refused(() -> trips.deliveredByOtp(identity, tripId, "2222", "rider-delivered-3", offline), 422, "OTP_INVALID");
        assertThat(fleet.db.queryForObject(offlineAlerts, Integer.class, tripId)).as("once per trip").isEqualTo(1);
        verify(alerts, timeout(2000)).opsAlert(eq("FLEET_OFFLINE_OTP_INVALID"), eq("Delivery code typed offline didn't match, order #0BDE0101"),
            anyString(), eq(Map.of("tripId", tripId.toString(), "orderCode", "#0BDE0101", "riderId", rider.toString())));

        assertThat(trips.deliveredByOtp(identity, tripId, "4821", "rider-delivered-4", offline).step()).isEqualTo("DELIVERED");
    }

    @Test
    void anOrderAcceptedBeforeDeliveryCodesExistedOpensThePhotoRouteAtOnce() {
        toDrop();
        when(codes.verify(any(), anyString())).thenReturn(new DeliveryCodeClient.Result(Outcome.NOT_FOUND, 0));
        assertThatThrownBy(() -> trips.deliveredByOtp(identity, tripId, "1234", "rider-delivered-1"))
            .isInstanceOfSatisfying(FleetApiException.class, error -> {
                assertThat(error.status()).isEqualTo(423);
                assertThat(error.code()).isEqualTo("OTP_LOCKED");
                assertThat(error.getMessage()).isEqualTo("This order has no OTP. Use the photo option; ops will check it.");
            });
        refused(() -> trips.deliveredByOtp(identity, tripId, "1234", "rider-delivered-1"), 423, "OTP_LOCKED");
        refused(() -> trips.deliveredByOtp(identity, tripId, "5678", "rider-delivered-2"), 423, "OTP_LOCKED");
        verify(codes, times(1)).verify(any(), anyString());

        MockMultipartFile photo = new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG);
        assertThat(trips.deliveredByPhoto(identity, tripId, 0, photo, "photo-1").step()).as("no calls or wait needed").isEqualTo("DELIVERED");
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> assertThat(event.held()).isTrue());
    }

    @Test
    void thePhotoNeedsTwoCallsAndTheUnreachableWait() {
        toDrop();
        MockMultipartFile photo = new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG);
        refused(() -> trips.deliveredByPhoto(identity, tripId, 1, photo, "p1"), 422, "CALLS_REQUIRED");
        refused(() -> trips.deliveredByPhoto(identity, tripId, 2, photo, "p2"), 422, "WAIT_NOT_OVER");
        refused(() -> trips.deliveredByPhoto(identity, tripId, 2, new MockMultipartFile("photo", "x.jpg", "image/jpeg", new byte[] {1, 2}),
            "p3"), 422, "PHOTO_REQUIRED");
        fleet.db.update("UPDATE fleet_schema.trip SET arrived_drop_at = now() - INTERVAL '10 minutes 1 second' WHERE id = ?", tripId);
        assertThat(trips.deliveredByPhoto(identity, tripId, 2, photo, "p4").step()).isEqualTo("DELIVERED");
    }

    @Test
    void failedOnlyAfterPickupWithFullPayAndTheReturnHeldForOps() {
        refused(() -> trips.failed(identity, tripId, "WRONG_ADDRESS", null, "f1"), 409, "STEP_CONFLICT");
        trips.step(identity, tripId, "arrived-pickup", "k1");
        trips.step(identity, tripId, "picked-up", "k2");
        refused(() -> trips.failed(identity, tripId, "CUSTOMER_UNREACHABLE", null, "f2"), 409, "STEP_CONFLICT");
        refused(() -> trips.failed(identity, tripId, "LATE", null, "f3"), 400, "VALIDATION_FAILED");

        Trip failed = trips.failed(identity, tripId, "WRONG_ADDRESS", "Gate locked, no flat 2", "f4");

        assertThat(failed.step()).isEqualTo("FAILED");
        assertThat(failed.cancelReason()).isEqualTo("WRONG_ADDRESS");
        assertThat(failed.payLines()).extracting(PayLine::component).containsExactly("base", "drop-km", "return-km");
        assertThat(failed.payPaise()).isEqualTo(4000 + 1350 + 3150);
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> assertThat(event.held()).isTrue());
        assertThat(trips.failed(identity, tripId, "WRONG_ADDRESS", "Gate locked, no flat 2", "f4").step()).isEqualTo("FAILED");
        refused(() -> trips.step(identity, tripId, "arrived-drop", "k9"), 409, "TRIP_NOT_ACTIVE");
    }

    @Test
    void anUnreachableCustomerMeansFullPayAfterTheWait() {
        toDrop();
        refused(() -> trips.failed(identity, tripId, "CUSTOMER_UNREACHABLE", null, "f1"), 422, "WAIT_NOT_OVER");
        fleet.db.update("UPDATE fleet_schema.trip SET arrived_drop_at = now() - INTERVAL '11 minutes' WHERE id = ?", tripId);
        Trip failed = trips.failed(identity, tripId, "CUSTOMER_UNREACHABLE", null, "f2");
        assertThat(failed.payLines()).extracting(PayLine::component).containsExactly("base", "drop-km");
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> assertThat(event.held()).isTrue());
    }

    /**
     * Blueprint A2, A4: a trip done in airplane mode syncs at once when the signal returns. Each step counts from its tap,
     * and the arrival at the drop, backed by a fix at the door, starts the door wait then: the photo isn't WAIT_NOT_OVER.
     */
    @Test
    void stepsTappedOfflineCountFromTheTapAndTheDoorWaitFromAnArrivalBackedByAFixAtTheDoor() {
        fleet.db.update("UPDATE fleet_schema.trip SET accepted_at = now() - INTERVAL '40 minutes' WHERE id = ?", tripId);
        trips.step(identity, tripId, "arrived-pickup", "k1", tap(25, KITCHEN_LAT + 0.001, KITCHEN_LNG, false));
        trips.step(identity, tripId, "picked-up", "k2", new Tap(20 * 60_000L, null));
        trips.step(identity, tripId, "arrived-drop", "k3", tap(11, 17.4601, 78.3601, false));
        assertThat(minutesAgo("arrived_kitchen_at")).isBetween(24.9, 25.2);
        assertThat(minutesAgo("picked_up_at")).isBetween(19.9, 20.2);
        assertThat(minutesAgo("arrived_drop_at")).as("the 10-minute door wait is over").isBetween(10.9, 11.2);

        Trip delivered = trips.deliveredByPhoto(identity, tripId, 2, new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG), "p1");

        assertThat(delivered.step()).isEqualTo("DELIVERED");
        assertThat(fleet.db.queryForMap("SELECT lat, lng, mock, (detail ->> 'ageMs')::bigint AS age_ms FROM fleet_schema.trip_event "
            + "WHERE trip_id = ? AND idempotency_key = 'k3'", tripId)).containsEntry("lat", 17.4601).containsEntry("lng", 78.3601)
            .containsEntry("mock", false).containsEntry("age_ms", 11 * 60_000L);
    }

    /** Reached the door with no signal and no usable fix, both steps synced later: the wait still runs between the two taps. */
    @Test
    void theDoorWaitRunsBetweenTheArrivalAndPhotoTapsEvenWithoutAFixAtTheDoor() {
        fleet.db.update("UPDATE fleet_schema.trip SET accepted_at = now() - INTERVAL '40 minutes' WHERE id = ?", tripId);
        trips.step(identity, tripId, "arrived-pickup", "k1");
        trips.step(identity, tripId, "picked-up", "k2");
        trips.step(identity, tripId, "arrived-drop", "k3", new Tap(15 * 60_000L, null));
        assertThat(minutesAgo("arrived_drop_at")).as("no fix at the door: the arrival itself counts from now").isLessThan(0.2);
        MockMultipartFile photo = new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG);
        refused(() -> trips.deliveredByPhoto(identity, tripId, 2, photo, "p1", new Tap(11 * 60_000L, null)), 422, "WAIT_NOT_OVER");
        refused(() -> trips.failed(identity, tripId, "CUSTOMER_UNREACHABLE", null, "f1", new Tap(11 * 60_000L, null)), 422, "WAIT_NOT_OVER");
        assertThat(trips.deliveredByPhoto(identity, tripId, 2, photo, "p2", new Tap(5 * 60_000L, null)).step())
            .as("10 minutes after the arrival tap, though both reached the server just now").isEqualTo("DELIVERED");
        assertThat(fleet.db.queryForObject("SELECT (detail ->> 'doorWaitFrom')::timestamptz < now() - INTERVAL '14 minutes' "
            + "FROM fleet_schema.trip_event WHERE trip_id = ? AND kind = 'DELIVERED'", Boolean.class, tripId))
            .as("the delivery keeps when the wait started, for ops' check").isTrue();
    }

    /** A phone can't put the arrival before the trip existed: the wait never starts before the accept (the server's time). */
    @Test
    void anArrivalTappedBeforeTheAcceptCountsFromTheAccept() {
        trips.step(identity, tripId, "arrived-pickup", "k1");
        trips.step(identity, tripId, "picked-up", "k2");
        trips.step(identity, tripId, "arrived-drop", "k3", new Tap(12 * 3_600_000L, null));
        MockMultipartFile photo = new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG);
        refused(() -> trips.deliveredByPhoto(identity, tripId, 2, photo, "p1"), 422, "WAIT_NOT_OVER");
        fleet.db.update("UPDATE fleet_schema.trip SET accepted_at = now() - INTERVAL '10 minutes 1 second' WHERE id = ?", tripId);
        assertThat(trips.deliveredByPhoto(identity, tripId, 2, photo, "p2").step()).isEqualTo("DELIVERED");
    }

    /** An arrival's earlier time needs evidence; a step's age is capped at 30 minutes and never goes before the step before. */
    @Test
    void anEarlierArrivalNeedsARealFixAtThePlaceAndATapAgeIsCapped() {
        fleet.db.update("UPDATE fleet_schema.trip SET accepted_at = now() - INTERVAL '3 hours' WHERE id = ?", tripId);
        trips.step(identity, tripId, "arrived-pickup", "k1", tap(120, KITCHEN_LAT + 0.001, KITCHEN_LNG, false));
        assertThat(minutesAgo("arrived_kitchen_at")).as("2 hours ago is capped at 30 minutes").isBetween(29.9, 30.2);
        trips.step(identity, tripId, "picked-up", "k2", new Tap(45 * 60_000L, null));
        assertThat(minutesAgo("picked_up_at")).as("never before the arrival").isBetween(29.9, 30.2);
        trips.step(identity, tripId, "arrived-drop", "k3", tap(9, 17.46, 78.36, true));
        assertThat(minutesAgo("arrived_drop_at")).as("a mock fix proves nothing: now").isLessThan(0.2);
    }

    @Test
    void anEarlierArrivalWithoutAFixAtTheKitchenCountsFromNow() {
        fleet.db.update("UPDATE fleet_schema.trip SET accepted_at = now() - INTERVAL '1 hour' WHERE id = ?", tripId);
        trips.step(identity, tripId, "arrived-pickup", "k1", tap(5, KITCHEN_LAT + 0.02, KITCHEN_LNG, false));
        assertThat(minutesAgo("arrived_kitchen_at")).as("the tap's fix was 2.2 km away: now, by the latest position").isLessThan(0.2);
    }

    @Test
    void theKitchenZoneIsJudgedByTheTapsOwnFixTakenAtTheTap() {
        Trip trip = trips.step(identity, tripId, "arrived-pickup", "k1", tap(0, KITCHEN_LAT + 0.02, KITCHEN_LNG, false));
        assertThat(trip.arrivedKitchenAt()).as("the tap's fix is 2.2 km away, whatever the last position says").isNull();
    }

    @Test
    void anotherRidersTripIsNotFound() {
        UUID other = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        UUID otherIdentity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, other);
        refused(() -> trips.step(otherIdentity, tripId, "arrived-pickup", "k1"), 404, "TRIP_NOT_FOUND");
        assertThat(trips.active(otherIdentity)).isEmpty();
    }

    /**
     * Phase C: a key is bound to the request it first came with. Its retry is the same step though the tap comes again aged
     * (ageMs and the fix's own ageMs), and so is a second "food not ready" tap, which keeps its key; another step under the
     * key, or the accept's key, is 422 and changes nothing.
     */
    @Test
    void aStepsKeyGetsItsFirstResultWithAnAgedTapAndIsRefusedForAnotherStep() {
        RiderFix atTap = new RiderFix(KITCHEN_LAT + 0.001, KITCHEN_LNG, 9.0, Instant.now(), false, 63_000L);
        Trip atKitchen = trips.step(identity, tripId, "arrived-pickup", "k1", new Tap(60_000L, atTap));
        RiderFix aged = new RiderFix(atTap.lat(), atTap.lng(), atTap.accuracyM(), atTap.at(), atTap.mock(), 68_000L);
        assertThat(trips.step(identity, tripId, "arrived-pickup", "k1", new Tap(65_000L, aged)).version())
            .as("the queue's retry 5 s later").isEqualTo(atKitchen.version());
        Trip notReady = trips.step(identity, tripId, "food-not-ready", "k2", tap(1, KITCHEN_LAT + 0.001, KITCHEN_LNG, false));
        assertThat(trips.step(identity, tripId, "food-not-ready", "k2", tap(0, KITCHEN_LAT + 0.002, KITCHEN_LNG, true)).version())
            .as("tapped again, a new tap under the same key").isEqualTo(notReady.version());

        refused(() -> trips.step(identity, tripId, "picked-up", "k1"), 422, "IDEMPOTENCY_KEY_REUSED");
        String acceptKey = fleet.db.queryForObject("SELECT idempotency_key FROM fleet_schema.trip_event WHERE trip_id = ? AND kind = 'ACCEPTED'",
            String.class, tripId);
        refused(() -> trips.step(identity, tripId, "picked-up", acceptKey), 422, "IDEMPOTENCY_KEY_REUSED");
        assertThat(trips.active(identity).orElseThrow().version()).as("nothing moved").isEqualTo(notReady.version());
        assertThat(fleet.db.queryForObject("SELECT request_hash FROM fleet_schema.trip_event WHERE trip_id = ? AND idempotency_key = 'k1'",
            String.class, tripId)).isEqualTo(FleetTripService.requestHash("/trips/" + tripId + "/arrived-pickup"));
        assertThatThrownBy(() -> trips.step(identity, tripId, "picked-up", "k1")).hasMessage(FleetTripService.KEY_REUSED);
    }

    /**
     * The key is bound to delivering by OTP, never to the code (its 4 digits could be recovered from the stored hash): a retry,
     * aged, deferred (capturedOffline) or with another code, gets the first answer without asking order-service again; the
     * photo under the key is 422.
     */
    @Test
    void aDeliveryCodesKeyIsBoundToTheOtpMethodNeverToTheCode() {
        toDrop();
        refused(() -> trips.deliveredByOtp(identity, tripId, "1111", "d1", new Tap(2_000L, null)), 422, "OTP_INVALID");
        assertThatThrownBy(() -> trips.deliveredByOtp(identity, tripId, "1111", "d1", new Tap(90_000L, null, true)))
            .as("the same tap sent again once it was deferred").isInstanceOfSatisfying(FleetApiException.class,
                error -> assertThat(error.attemptsLeft()).isEqualTo(4));
        assertThatThrownBy(() -> trips.deliveredByOtp(identity, tripId, "4821", "d1")).as("another code: the key's first answer")
            .isInstanceOfSatisfying(FleetApiException.class, error -> assertThat(error.attemptsLeft()).isEqualTo(4));
        MockMultipartFile photo = new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG);
        refused(() -> trips.deliveredByPhoto(identity, tripId, 2, photo, "d1"), 422, "IDEMPOTENCY_KEY_REUSED");
        assertThat(fleet.db.queryForObject("SELECT request_hash FROM fleet_schema.trip_event WHERE trip_id = ? AND idempotency_key = 'd1'",
            String.class, tripId)).as("no code in it").isEqualTo(FleetTripService.requestHash("/trips/" + tripId + "/delivered", "method", "OTP"));
        verify(codes, times(1)).verify(any(), anyString());

        assertThat(trips.deliveredByOtp(identity, tripId, "4821", "d2").step()).isEqualTo("DELIVERED");
        assertThat(trips.deliveredByOtp(identity, tripId, "4821", "d2", new Tap(30_000L, null, true)).step()).isEqualTo("DELIVERED");
        refused(() -> trips.deliveredByPhoto(identity, tripId, 2, photo, "d2"), 422, "IDEMPOTENCY_KEY_REUSED");
        verify(codes, times(2)).verify(any(), anyString());
        verify(storage, times(0)).upload(anyString(), any(), anyString(), anyBoolean());
    }

    /**
     * The key is bound to delivering by photo, not to the photo's bytes or the calls: a retry whose photo was re-encoded,
     * that counts the calls again, or that comes without its photo (P1-07) gets the delivered trip; the OTP under the key is 422.
     */
    @Test
    void aPhotoDeliverysKeyIsBoundToThePhotoMethodNotItsBytesOrCalls() {
        toDrop();
        fleet.db.update("UPDATE fleet_schema.trip SET arrived_drop_at = now() - INTERVAL '11 minutes' WHERE id = ?", tripId);
        MockMultipartFile photo = new MockMultipartFile("photo", "door.jpg", "image/jpeg", JPEG);
        assertThat(trips.deliveredByPhoto(identity, tripId, 2, photo, "p1", new Tap(1_000L, null)).step()).isEqualTo("DELIVERED");
        assertThat(trips.deliveredByPhoto(identity, tripId, 2, photo, "p1", new Tap(9_000L, null)).step())
            .as("the same photo sent again, its tap aged").isEqualTo("DELIVERED");
        MockMultipartFile reencoded = new MockMultipartFile("photo", "door.jpg", "image/jpeg",
            new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x00, 0x02});
        assertThat(trips.deliveredByPhoto(identity, tripId, 2, reencoded, "p1").step()).as("re-encoded").isEqualTo("DELIVERED");
        assertThat(trips.deliveredByPhoto(identity, tripId, 3, photo, "p1").step()).as("the calls counted again").isEqualTo("DELIVERED");
        assertThat(trips.deliveredByPhoto(identity, tripId, 2, null, "p1").step()).isEqualTo("DELIVERED");
        refused(() -> trips.deliveredByOtp(identity, tripId, "4821", "p1"), 422, "IDEMPOTENCY_KEY_REUSED");
        verify(storage, times(1)).upload(anyString(), any(), anyString(), anyBoolean());
    }

    @Test
    void aFailuresKeyIsBoundToItsReasonAndNote() {
        trips.step(identity, tripId, "arrived-pickup", "k1");
        trips.step(identity, tripId, "picked-up", "k2");
        assertThat(trips.failed(identity, tripId, "WRONG_ADDRESS", "Gate locked", "f1", new Tap(4_000L, null)).step()).isEqualTo("FAILED");
        assertThat(trips.failed(identity, tripId, "WRONG_ADDRESS", "Gate locked", "f1", new Tap(60_000L, null)).step()).isEqualTo("FAILED");
        refused(() -> trips.failed(identity, tripId, "UNSAFE", "Gate locked", "f1"), 422, "IDEMPOTENCY_KEY_REUSED");
        refused(() -> trips.failed(identity, tripId, "WRONG_ADDRESS", "Wrong flat", "f1"), 422, "IDEMPOTENCY_KEY_REUSED");
        assertThat(events).hasSize(1);
    }

    /** Rows stored before V177 have no hash: a repeated key replays as it always did, whatever came with it. */
    @Test
    void aKeyStoredBeforeTheHashReplaysAsItAlwaysDid() {
        toDrop();
        refused(() -> trips.deliveredByOtp(identity, tripId, "1111", "d1"), 422, "OTP_INVALID");
        fleet.db.update("UPDATE fleet_schema.trip_event SET request_hash = NULL WHERE trip_id = ?", tripId);

        assertThat(trips.failed(identity, tripId, "UNSAFE", null, "k1").step()).as("the old key's trip, as before").isEqualTo("AT_DROP");
        assertThatThrownBy(() -> trips.deliveredByOtp(identity, tripId, "4821", "d1")).as("the old key's first answer")
            .isInstanceOfSatisfying(FleetApiException.class, error -> {
                assertThat(error.code()).isEqualTo("OTP_INVALID");
                assertThat(error.attemptsLeft()).isEqualTo(4);
            });
        verify(codes, times(1)).verify(any(), anyString());
    }

    private void toDrop() {
        trips.step(identity, tripId, "arrived-pickup", "k1");
        trips.step(identity, tripId, "picked-up", "k2");
        trips.step(identity, tripId, "arrived-drop", "k3");
    }

    /** A step tapped minutesAgo with the phone's fix then (taken 3 s before the tap). */
    private static Tap tap(int minutesAgo, double lat, double lng, boolean mock) {
        long ageMs = minutesAgo * 60_000L;
        return new Tap(ageMs, new RiderFix(lat, lng, 9.0, Instant.now(), mock, ageMs + 3000));
    }

    private double minutesAgo(String column) {
        return fleet.db.queryForObject("SELECT EXTRACT(EPOCH FROM now() - " + column + ")::float8 / 60 FROM fleet_schema.trip WHERE id = ?",
            Double.class, tripId);
    }

    private static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
