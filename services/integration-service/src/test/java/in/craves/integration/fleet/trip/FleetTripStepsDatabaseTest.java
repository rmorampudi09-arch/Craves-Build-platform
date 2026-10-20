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
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import java.util.ArrayList;
import java.util.List;
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
            fleet.transactions);
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
        verify(storage).upload(startsWith("riders/" + rider + "/trips/" + tripId + "/delivery-"), eq(JPEG), eq("image/jpeg"), anyBoolean());
        assertThat(events).singleElement().isInstanceOfSatisfying(FleetTripPayFinalized.class, event -> {
            assertThat(event.held()).isTrue();
            assertThat(event.holdReason()).isEqualTo(FleetTripService.PHOTO_HOLD);
        });
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
        assertThat(trips.failed(identity, tripId, "WRONG_ADDRESS", null, "f4").step()).isEqualTo("FAILED");
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

    @Test
    void anotherRidersTripIsNotFound() {
        UUID other = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        UUID otherIdentity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, other);
        refused(() -> trips.step(otherIdentity, tripId, "arrived-pickup", "k1"), 404, "TRIP_NOT_FOUND");
        assertThat(trips.active(otherIdentity)).isEmpty();
    }

    private void toDrop() {
        trips.step(identity, tripId, "arrived-pickup", "k1");
        trips.step(identity, tripId, "picked-up", "k2");
        trips.step(identity, tripId, "arrived-drop", "k3");
    }

    private static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
