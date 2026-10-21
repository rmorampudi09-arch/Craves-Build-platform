package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.trip.FleetTripModels;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;

/** The fleet stage of the dispatch chain (PLAN F8a, F9) against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetDispatchDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final RoadDistanceClient roads = mock(RoadDistanceClient.class);
    final RiderPushClient push = mock(RiderPushClient.class);
    FleetDispatcher dispatcher;
    UUID chefSubOrderId;
    DeliveryCommandMessage command;

    @BeforeEach
    void setUp() {
        dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, new FleetPolicyStore(fleet.db, json),
            new FleetTestMode(fleet.db, FleetDatabase.properties(true)), roads, push, json);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        when(push.offer(anyString(), org.mockito.ArgumentMatchers.any(), anyString(), anyString(), anyString(), anyInt())).thenReturn("SENT");
        chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
        command = FleetDispatchFixtures.command(chefSubOrderId);
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
    }

    @Test
    void withNoPolicyInForceOrModeOffNothingIsTouched() {
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        assertThat(dispatcher.run(command, OptionalLong::empty, true)).as("the seeded draft policy never drives dispatch").isEmpty();
        FleetDispatchFixtures.policy(fleet.db, "off");
        assertThat(dispatcher.run(command, OptionalLong::empty, true)).isEmpty();
        assertThat(count("fleet_schema.trip")).isZero();
        verifyNoInteractions(roads, push);
    }

    @Test
    void shadowComputesAndLogsOnly() {
        FleetDispatchFixtures.policy(fleet.db, "shadow");
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        assertThat(dispatcher.run(command, () -> OptionalLong.of(9000), true)).isEmpty();
        assertThat(count("fleet_schema.trip")).isZero();
        assertThat(count("fleet_schema.trip_offer")).isZero();
        verifyNoInteractions(push);
    }

    @Test
    void liveOffersTheThreeNearestEligibleRidersWithLockedPayAndWaits() throws Exception {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID nearest = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        UUID second = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        UUID third = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT + 0.010, KITCHEN_LNG, 5, false);
        UUID fourth = FleetDispatchFixtures.riderOnShift(fleet, "+919800000004", KITCHEN_LAT + 0.015, KITCHEN_LNG, 5, false);
        UUID mock = FleetDispatchFixtures.riderOnShift(fleet, "+919800000005", KITCHEN_LAT, KITCHEN_LNG, 5, true);
        UUID stale = FleetDispatchFixtures.riderOnShift(fleet, "+919800000006", KITCHEN_LAT, KITCHEN_LNG, 60, false);
        UUID far = FleetDispatchFixtures.riderOnShift(fleet, "+919800000007", KITCHEN_LAT + 0.08, KITCHEN_LNG, 5, false);
        UUID notListed = FleetDispatchFixtures.riderOnShift(fleet, "+919800000008", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("DELETE FROM fleet_schema.test_mode_rider WHERE rider_id = ?", notListed);
        UUID busy = FleetDispatchFixtures.riderOnShift(fleet, "+919800000009", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'PICKED_UP' WHERE id = ?", busy, fleet.trip(UUID.randomUUID()));

        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOfSatisfying(DeliveryProviderTemporarilyUnavailableException.class,
                waiting -> assertThat(waiting.policyDeadline()).isBefore(Instant.now().plusSeconds(11)));

        Map<String, Object> trip = fleet.db.queryForMap("SELECT * FROM fleet_schema.trip WHERE chef_sub_order_id = ?", chefSubOrderId);
        assertThat(trip.get("state")).isEqualTo("SEARCHING");
        assertThat(trip.get("provider")).isEqualTo("CRAVES_FLEET");
        assertThat(trip.get("order_code")).isEqualTo("#0BDE0101");
        assertThat(trip.get("items_count")).isEqualTo(3);
        assertThat(trip.get("customer_first_name")).isEqualTo("Anil");
        assertThat(trip.get("drop_distance_m")).isEqualTo(3500);
        assertThat(fleet.db.queryForObject("SELECT round(EXTRACT(EPOCH FROM deadline_at - opened_at)) FROM fleet_schema.trip_stage "
            + "WHERE trip_id = ? AND seq = 1 AND provider = 'CRAVES_FLEET' AND state = 'OPEN'", Integer.class, trip.get("id"))).isEqualTo(60);
        List<Map<String, Object>> offers = fleet.db.queryForList("SELECT rider_id, pay_paise, pickup_distance_m, drop_distance_m, "
            + "rate_card_version, round(EXTRACT(EPOCH FROM expires_at - offered_at)) AS seconds FROM fleet_schema.trip_offer "
            + "WHERE trip_id = ? AND state = 'ACTIVE' ORDER BY pickup_distance_m", trip.get("id"));
        assertThat(offers).extracting(offer -> offer.get("rider_id")).containsExactly(nearest, second, third);
        assertThat(offers).allSatisfy(offer -> {
            assertThat(offer.get("seconds")).isEqualTo(new java.math.BigDecimal("40"));
            assertThat(offer.get("rate_card_version")).isEqualTo("2026-10-v1");
            assertThat(offer.get("drop_distance_m")).isEqualTo(3500);
        });
        // 111 m x 1.3 = 144 m pickup: inside the free km, so 4000 base + 1350 drop km.
        assertThat(offers.get(0).get("pay_paise")).isEqualTo(5350L);
        ArgumentCaptor<String> pushed = ArgumentCaptor.forClass(String.class);
        verify(push, timeout(2000)).offer(eq("fcm-+919800000001"), org.mockito.ArgumentMatchers.any(), pushed.capture(), eq("New order: ₹53.50"),
            eq("Madhapur to Kondapur"), anyInt());
        // The push carries the rider-v1 Offer from the same mapping as /locations.
        JsonNode rung = json.readTree(pushed.getValue());
        assertThat(rung.fieldNames()).toIterable().containsExactlyInAnyOrder("offerId", "tripId", "expiresAt", "expiresInSec", "payPaise",
            "pickupDistanceM", "dropDistanceM", "kitchenArea", "customerLocality", "estMinutes", "itemsCount", "payLines");
        assertThat(rung.get("tripId").asText()).isEqualTo(trip.get("id").toString());
        assertThat(rung.get("expiresInSec").asLong()).isBetween(35L, 40L);
        assertThat(rung.get("payPaise").asLong()).isEqualTo(5350L);
        assertThat(rung.get("itemsCount").asInt()).isEqualTo(3);
        assertThat(rung.get("estMinutes").asInt()).isEqualTo(FleetTripModels.estMinutes(rung.get("pickupDistanceM").asInt(), 3500));
        assertThat(rung.get("payLines").get(0).get("label").asText()).isEqualTo("base");
        assertThat(List.of(fourth, mock, stale, far, notListed, busy)).doesNotContainAnyElementsOf(
            offers.stream().map(offer -> (UUID) offer.get("rider_id")).toList());
    }

    @Test
    void aRiderWhoGoesOfflineWhileTheQuotesComeBackGetsNoOfferAndAShiftPastItsTwelveHoursIsNotOffered() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID leaving = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        UUID expired = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET credential_expires_at = now() - INTERVAL '1 second' WHERE rider_id = ?", expired);

        assertThat(dispatcher.run(command, () -> {
            fleet.db.update("UPDATE fleet_schema.rider_shift SET ended_at = now(), credential_revoked_at = now() WHERE rider_id = ?", leaving);
            return OptionalLong.of(9000);
        }, true)).as("nobody is left to ring, so Borzo comes next at once").isEmpty();

        assertThat(count("fleet_schema.trip_offer")).isZero();
        assertThat(fleet.db.queryForList("SELECT provider || ':' || state || ':' || COALESCE(outcome, '') FROM fleet_schema.trip_stage ORDER BY seq",
            String.class)).containsExactly("CRAVES_FLEET:CLOSED:RIDERS_BUSY", "BORZO:OPEN:");
        verifyNoInteractions(push);
    }

    @Test
    void theFleetStageClosesAtItsDeadlineBeforeBorzoStartsAndOnlyOnce() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip WHERE chef_sub_order_id = ?", UUID.class, chefSubOrderId);
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '61 seconds', deadline_at = now() - INTERVAL '1 second' "
            + "WHERE trip_id = ?", trip);

        assertThat(dispatcher.run(command, OptionalLong::empty, true)).as("closed: Borzo and Pidge carry on").isEmpty();

        assertThat(fleet.db.queryForList("SELECT provider || ':' || state || ':' || COALESCE(outcome, '') FROM fleet_schema.trip_stage "
            + "WHERE trip_id = ? ORDER BY seq", String.class, trip)).containsExactly("CRAVES_FLEET:CLOSED:NO_ACCEPT", "BORZO:OPEN:");
        assertThat(fleet.db.queryForList("SELECT state FROM fleet_schema.trip_offer WHERE trip_id = ?", String.class, trip))
            .containsOnly("WITHDRAWN");
        assertThat(fleet.db.queryForObject("SELECT provider FROM fleet_schema.trip WHERE id = ?", String.class, trip)).isEqualTo("BORZO");
        assertThat(dispatcher.closeFleetStage(trip, "NO_ACCEPT", true, 600)).as("each stage advances once").isFalse();
        assertThat(dispatcher.run(command, OptionalLong::empty, true)).isEmpty();
        assertThat(count("fleet_schema.trip_stage")).isEqualTo(2);
    }

    @Test
    void whenEveryRiderDeclinesTheStageClosesEarlyAndPidgeIsNextWithoutBorzo() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, false))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now()");

        assertThat(dispatcher.run(command, OptionalLong::empty, false)).isEmpty();
        assertThat(fleet.db.queryForList("SELECT provider || ':' || COALESCE(outcome, '') || ':' || "
            + "round(EXTRACT(EPOCH FROM deadline_at - opened_at)) FROM fleet_schema.trip_stage ORDER BY seq", String.class))
            .containsExactly("CRAVES_FLEET:ALL_DECLINED_OR_EXPIRED:60", "PIDGE::600");
    }

    @Test
    void theCostGuardLeavesTheOrderToCouriersWithTheChainRecorded() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        // 5350 pay + 500 overhead > 3000 quote + 1000 premium
        assertThat(dispatcher.run(command, () -> OptionalLong.of(3000), true)).isEmpty();
        assertThat(count("fleet_schema.trip_offer")).isZero();
        assertThat(fleet.db.queryForList("SELECT provider || ':' || state || ':' || COALESCE(outcome, '') FROM fleet_schema.trip_stage "
            + "ORDER BY seq", String.class)).containsExactly("CRAVES_FLEET:CLOSED:COST_GUARD", "BORZO:OPEN:");
    }

    @Test
    void testModeTouchesOnlyAllowListedKitchens() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        UUID other = UUID.randomUUID();
        FleetDispatchFixtures.kitchen(fleet.db, other, false);
        assertThat(dispatcher.run(FleetDispatchFixtures.command(other), OptionalLong::empty, true)).isEmpty();
        assertThat(dispatcher.run(FleetDispatchFixtures.command(UUID.randomUUID()), OptionalLong::empty, true))
            .as("no checkout quote: the chef is unknown").isEmpty();
        assertThat(count("fleet_schema.trip")).isZero();
    }

    @Test
    void theChefsReadyTimeIsKeptEvenBeforeTheTripStarts() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        Instant ready = Instant.parse("2026-11-10T13:05:00Z");
        dispatcher.chefReady(chefSubOrderId, ready);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        dispatcher.chefReady(chefSubOrderId, ready.plusSeconds(60));
        assertThat(fleet.db.queryForObject("SELECT chef_ready_at FROM fleet_schema.trip WHERE chef_sub_order_id = ?", java.sql.Timestamp.class,
            chefSubOrderId).toInstant()).as("the first ready time counts").isEqualTo(ready);
    }

    @Test
    void theOrderCodeIsTheFirstEightCharactersTheChefAndCustomerSee() {
        assertThat(FleetDispatcher.orderCode(UUID.fromString("0bde0101-aaaa-4bbb-8ccc-dddddddddddd"))).isEqualTo("#0BDE0101");
        assertThat(FleetTripModels.estMinutes(1800, 3500)).isEqualTo(21);
    }

    private int count(String table) {
        return fleet.db.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }
}
