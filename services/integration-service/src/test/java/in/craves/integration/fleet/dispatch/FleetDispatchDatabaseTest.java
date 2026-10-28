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
import static org.mockito.Mockito.times;
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
    void liveWithoutAPublishedRateCardInForceOpensNoFleetStage() {
        // Behind RATE_CARD_REQUIRED: a live policy written some other way still never offers trips on draft pay.
        fleet.db.update("INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, "
            + "fleet_stage_seconds, radius_m, ranges) VALUES ('2026-09-v9', 'PUBLISHED', now() - INTERVAL '1 day', now(), 'live', 40, 60, "
            + "5000, '{}')");
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        assertThat(dispatcher.run(command, () -> OptionalLong.of(9000), true)).isEmpty();
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, status, effective_from, published_at, base_paise, base_drop_m, "
            + "drop_per_km_paise, pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, "
            + "ranges, summary_of_changes) SELECT '2026-11-v2', 'PUBLISHED', now() + INTERVAL '20 days', now(), base_paise, base_drop_m, "
            + "drop_per_km_paise, pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, "
            + "ranges, summary_of_changes FROM fleet_schema.rate_card WHERE version = '2026-10-v1'");
        assertThat(dispatcher.run(command, () -> OptionalLong.of(9000), true)).as("a card that starts later does not pay yet").isEmpty();
        assertThat(count("fleet_schema.trip")).isZero();
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
            "pickupDistanceM", "dropDistanceM", "kitchenArea", "customerLocality", "estMinutes", "itemsCount", "payLines", "reason");
        // Why this rider (Phase 4): today's rules, nearest first, three at once, in one round; four free riders were considered.
        assertThat(json.treeToValue(rung.get("reason"), Map.class))
            .isEqualTo(Map.of("rule", "NEAREST", "place", 1, "riders", 4, "atOnce", 3, "round", 1));
        assertThat(rung.get("tripId").asText()).isEqualTo(trip.get("id").toString());
        assertThat(rung.get("expiresInSec").asLong()).isBetween(35L, 40L);
        assertThat(rung.get("payPaise").asLong()).isEqualTo(5350L);
        assertThat(rung.get("itemsCount").asInt()).isEqualTo(3);
        assertThat(rung.get("estMinutes").asInt()).isEqualTo(FleetTripModels.estMinutes(rung.get("pickupDistanceM").asInt(), 3500));
        assertThat(rung.get("payLines").get(0).get("label").asText()).isEqualTo("base");
        assertThat(List.of(fourth, mock, stale, far, notListed, busy)).doesNotContainAnyElementsOf(
            offers.stream().map(offer -> (UUID) offer.get("rider_id")).toList());
    }

    /** P3-06: with road ranking on, the offers go to the nearest by road among the five nearest; pay keeps the straight line. */
    @Test
    void roadRankingOffersTheRidersNearestByRoadAndPaysByTheStraightLine() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID acrossTheRiver = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        UUID second = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.002, KITCHEN_LNG, 5, false);
        UUID third = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT + 0.003, KITCHEN_LNG, 5, false);
        UUID fourth = FleetDispatchFixtures.riderOnShift(fleet, "+919800000004", KITCHEN_LAT + 0.004, KITCHEN_LNG, 5, false);
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000005", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000006", KITCHEN_LAT + 0.006, KITCHEN_LNG, 5, false);
        when(roads.meters(eq(KITCHEN_LAT + 0.001), eq(KITCHEN_LNG), anyDouble(), anyDouble())).thenReturn(9000);
        FleetDispatcher ranking = new FleetDispatcher(fleet.db, fleet.transactions, new FleetPolicyStore(fleet.db, json),
            new FleetTestMode(fleet.db, FleetDatabase.properties(true)), roads, push, json, true);

        assertThatThrownBy(() -> ranking.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);

        List<Map<String, Object>> offers = fleet.db.queryForList("SELECT o.rider_id, o.pickup_distance_m FROM fleet_schema.trip_offer o "
            + "JOIN fleet_schema.trip t ON t.id = o.trip_id WHERE t.chef_sub_order_id = ? ORDER BY o.pickup_distance_m", chefSubOrderId);
        assertThat(offers).extracting(offer -> offer.get("rider_id")).containsExactly(second, third, fourth).doesNotContain(acrossTheRiver);
        assertThat(offers).extracting(offer -> (Integer) offer.get("pickup_distance_m")).as("straight line × the detour, as the terms say")
            .allSatisfy(metres -> assertThat(metres).isLessThan(1000));
        verify(roads, times(6)).meters(anyDouble(), anyDouble(), anyDouble(), anyDouble()); // the drop, then the five nearest
    }

    /**
     * Online is the heartbeat, not the fix (BLUEPRINT A1): a phone that called 5 s ago with a 2-minute-old fix is offered the
     * order; one whose last call was 46 s ago is not, however fresh its fix; nor is one whose newest fix is over 3 minutes old.
     */
    @Test
    void theHeartbeatDecidesWhoIsOnlineAndTheFixMustBeUnderThreeMinutesOld() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID calling = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 120, false);
        FleetDispatchFixtures.seen(fleet.db, calling, 5);
        UUID quiet = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        FleetDispatchFixtures.seen(fleet.db, quiet, 46);
        UUID oldFix = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT, KITCHEN_LNG, 190, false);
        FleetDispatchFixtures.seen(fleet.db, oldFix, 5);

        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer WHERE state = 'ACTIVE'", UUID.class))
            .containsExactly(calling);
    }

    /** Blueprint A9: a phone that can't ring (notifications off) gets no offer, and is offered again once it can. */
    @Test
    void aPhoneThatCannotRingGetsNoOfferUntilItCan() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID silenced = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET can_ring = false WHERE rider_id = ?", silenced);
        assertThat(dispatcher.run(command, () -> OptionalLong.of(9000), true)).as("nobody to ring: the next courier at once").isEmpty();
        assertThat(count("fleet_schema.trip_offer")).isZero();

        UUID chefSubOrder = UUID.fromString("0bde0102-1111-4111-8111-111111111111");
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrder, true);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET can_ring = true WHERE rider_id = ?", silenced);
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(chefSubOrder), () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer WHERE state = 'ACTIVE'", UUID.class)).containsExactly(silenced);
    }

    /** Push results are stored on each offer (blueprint A5): SENT, or NO_TOKEN for a phone without a push token. */
    @Test
    void eachOffersPushResultIsStored() throws Exception {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID ringing = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        UUID tokenless = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.002, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_device SET fcm_token = NULL WHERE rider_id = ?", tokenless);

        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);

        Map<UUID, String> results = new java.util.HashMap<>();
        for (long until = System.currentTimeMillis() + 5000; results.size() < 2 && System.currentTimeMillis() < until; Thread.sleep(50)) {
            results.clear();
            for (Map<String, Object> row : fleet.db.queryForList("SELECT rider_id, push_result FROM fleet_schema.trip_offer WHERE pushed_at IS NOT NULL")) {
                results.put((UUID) row.get("rider_id"), (String) row.get("push_result"));
            }
        }
        assertThat(results).containsEntry(ringing, "SENT").containsEntry(tokenless, "NO_TOKEN");
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

    /** Phase 4: one rider at a time, in rounds while the stage lasts; nobody is offered twice; rounds stop at the policy's. */
    @Test
    void oneRiderAtATimeHearsOfTheOrderInRoundsUntilTheRoundsRunOut() {
        fairPolicy(0);
        UUID nearest = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        UUID second = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        UUID third = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT + 0.010, KITCHEN_LNG, 5, false);
        UUID fourth = FleetDispatchFixtures.riderOnShift(fleet, "+919800000004", KITCHEN_LAT + 0.015, KITCHEN_LNG, 5, false);

        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOfSatisfying(DeliveryProviderTemporarilyUnavailableException.class,
                waiting -> assertThat(waiting.policyDeadline()).as("looks again soon, to send the next round").isBefore(Instant.now().plusSeconds(6)));
        assertThat(activeOffers()).containsExactly(nearest);
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true)).as("still deciding: no second round yet")
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(count("fleet_schema.trip_offer")).isOne();

        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE rider_id = ?", nearest);
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).as("a decline costs nothing; the next rider hears").containsExactly(second);
        // Each round ranks the riders not yet asked: the second-nearest is now first of the three left.
        assertThat(reason(second)).containsEntry("place", 1).containsEntry("riders", 3).containsEntry("round", 2).containsEntry("atOnce", 1);

        fleet.db.update("UPDATE fleet_schema.trip_offer SET offered_at = now() - INTERVAL '30 seconds', expires_at = now() - INTERVAL '1 second' "
            + "WHERE rider_id = ?", second);
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).containsExactly(third);

        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE rider_id = ?", third);
        assertThat(dispatcher.run(command, () -> OptionalLong.of(9000), true)).as("three rounds, then Borzo").isEmpty();
        assertThat(fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer", UUID.class)).doesNotContain(fourth).hasSize(3);
        assertThat(fleet.db.queryForObject("SELECT provider FROM fleet_schema.trip WHERE chef_sub_order_id = ?", String.class, chefSubOrderId))
            .isEqualTo("BORZO");
    }

    /**
     * Phase 4 fair turns: within the band, the rider who has earned the least per online hour today hears first, then the
     * next; a rider outside the band waits for the riders inside it. Declines change nothing.
     */
    @Test
    void fairTurnsGoFirstToTheRiderWhoHasEarnedLeastPerOnlineHourToday() {
        FleetDatabase.assumeTodayIsHoursOld(4);
        fairPolicy(1500);
        UUID nearest = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        UUID behind = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        UUID outside = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT + 0.020, KITCHEN_LNG, 5, false);
        day(nearest, 30000, 60);  // ₹300 in an hour online
        day(behind, 0, 120);      // nothing in two hours
        day(outside, 0, 180);

        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).containsExactly(behind);
        assertThat(reason(behind)).containsEntry("rule", "FAIR").containsEntry("place", 1).containsEntry("riders", 3)
            .containsEntry("bandM", 1500).containsEntry("bandRiders", 2).containsEntry("earnedPerHourPaise", 0);

        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE rider_id = ?", behind);
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).as("the band before the rider outside it").containsExactly(nearest);
        assertThat(reason(nearest)).containsEntry("rule", "FAIR").containsEntry("place", 1).containsEntry("round", 2);
        assertThat(((Number) reason(nearest).get("earnedPerHourPaise")).longValue()).as("₹300 over an hour and a few seconds").isBetween(29_900L, 30_000L);

        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE rider_id = ?", nearest);
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).containsExactly(outside);
        // Each round draws the band again around the nearest rider not yet asked: the last rider is now its only one.
        assertThat(reason(outside)).containsEntry("place", 1).containsEntry("riders", 1).containsEntry("bandRiders", 1).containsEntry("round", 3);
    }

    @Test
    void equalEarningsGoToTheRiderFreeTheLongest() {
        FleetDatabase.assumeTodayIsHoursOld(2);
        fairPolicy(1500);
        UUID nearest = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        UUID waiting = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        day(nearest, 0, 20);
        day(waiting, 0, 50);
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).containsExactly(waiting);
        assertThat((Integer) reason(waiting).get("freeMinutes")).isBetween(49, 50);
    }

    /** Phase 4: a rider on a break hears of no order until it ends; the riders working hear as usual. */
    @Test
    void aRiderOnABreakHearsOfNoOrderUntilItEnds() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID resting = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        UUID working = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        FleetDispatchFixtures.onBreak(fleet.db, resting, 0, 10);
        assertThat(dispatcher.ridersNear(KITCHEN_LAT, KITCHEN_LNG)).isOne();
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).containsExactly(working);

        fleet.db.update("UPDATE fleet_schema.rider_break SET started_at = now() - INTERVAL '10 minutes', ends_at = now() - INTERVAL '1 second' "
            + "WHERE rider_id = ?", resting);
        assertThat(dispatcher.ridersNear(KITCHEN_LAT, KITCHEN_LNG)).as("the break is over").isEqualTo(1);
    }

    /**
     * Phase 4 rider choices: with CRAVES_FLEET_RIDER_CHOICES_ENABLED, a rider who chose a nearer pickup (as the offer shows it,
     * straight line x 1.3) or a shorter drop than the order's hears nothing of it; with the switch off their choices are ignored.
     */
    @Test
    void withRiderChoicesOnEachRidersFarthestPickupAndDropCount() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        UUID shortDrops = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.003, KITCHEN_LNG, 5, false);
        UUID nearKitchens = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        UUID anything = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT + 0.010, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider SET max_drop_m = 3000 WHERE id = ?", shortDrops);       // the drop is 3.5 km
        fleet.db.update("UPDATE fleet_schema.rider SET max_pickup_m = 500 WHERE id = ?", nearKitchens);    // 556 m x 1.3 = 723 m
        FleetDispatcher choices = new FleetDispatcher(fleet.db, fleet.transactions, new FleetPolicyStore(fleet.db, json),
            new FleetTestMode(fleet.db, FleetDatabase.properties(true)), roads, push, json, false, true);
        assertThatThrownBy(() -> choices.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).containsExactly(anything);
        assertThat(choices.ridersNear(KITCHEN_LAT, KITCHEN_LNG)).as("the rider deciding is busy; without an order, distances rule "
            + "nobody out").isEqualTo(2);

        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now()");
        UUID other = UUID.fromString("0bde0202-2222-4222-8222-222222222222");
        FleetDispatchFixtures.kitchen(fleet.db, other, true);
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(other), () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(activeOffers()).as("switched off: every nearby rider hears").containsExactlyInAnyOrder(shortDrops, nearKitchens, anything);
    }

    /** A live policy that offers to one rider at a time, 20 s each, up to three rounds in a 90 s stage, with this fair band. */
    private void fairPolicy(int bandM) {
        FleetDispatchFixtures.policy(fleet.db, "live", 20, 90, 1, 3, bandM);
    }

    /** A rider's day so far: online since minutesOnline ago (their shift started then) and paise credited today. */
    private void day(UUID rider, long paise, int minutesOnline) {
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - make_interval(mins => ?) WHERE rider_id = ? "
            + "AND ended_at IS NULL", minutesOnline, rider);
        if (paise > 0) {
            UUID trip = fleet.trip(UUID.randomUUID());
            fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'DELIVERED', finished_at = now() - INTERVAL '30 minutes', "
                + "pay_finalized_at = now() - INTERVAL '30 minutes' WHERE id = ?", rider, trip);
            fleet.db.update("INSERT INTO fleet_schema.rider_earning (id, rider_id, trip_id, component, revision, business_key, gross_paise, "
                + "withheld_paise, net_paise, rate_card_version, withdrawable_at) VALUES (?, ?, ?, 'base', 1, ?, ?, 0, ?, '2026-10-v1', now())",
                UUID.randomUUID(), rider, trip, "fleet-trip-pay/" + trip + "/base/1", paise, paise);
        }
    }

    private List<UUID> activeOffers() {
        return fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer WHERE state = 'ACTIVE' AND expires_at > now()", UUID.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> reason(UUID rider) {
        try {
            return json.readValue(fleet.db.queryForObject("SELECT reason::text FROM fleet_schema.trip_offer WHERE rider_id = ? "
                + "ORDER BY offered_at DESC LIMIT 1", String.class, rider), Map.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private int count(String table) {
        return fleet.db.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }
}
