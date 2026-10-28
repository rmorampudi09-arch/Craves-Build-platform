package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.engine.FleetEngineClient;
import in.craves.integration.fleet.engine.FleetEngineFeed;
import in.craves.integration.fleet.engine.FleetEngineWire;
import in.craves.integration.fleet.engine.FleetEngineWire.Candidate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;

/**
 * Phase 5, dispatch with the fleet engine (docs/riders/SCALE.md): live, the engine's ranking is used, test mode still
 * applies and Postgres keeps the last word; without an answer dispatch ranks riders itself; in shadow the engine is told
 * Java's ranking to compare; road ranking keeps the engine out.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetEngineDispatchDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final RoadDistanceClient roads = mock(RoadDistanceClient.class);
    final RiderPushClient push = mock(RiderPushClient.class);
    final FleetEngineFeed feed = mock(FleetEngineFeed.class);
    final FleetEngineClient engine = mock(FleetEngineClient.class);
    final UUID chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
    final DeliveryCommandMessage command = FleetDispatchFixtures.command(chefSubOrderId);
    UUID near;
    UUID second;
    UUID third;

    @BeforeEach
    void setUp() {
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        when(push.offer(anyString(), any(), anyString(), anyString(), anyString(), anyInt())).thenReturn("SENT");
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
        FleetDispatchFixtures.policy(fleet.db, "live");
        near = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        second = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        third = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT + 0.010, KITCHEN_LNG, 5, false);
    }

    @Test
    void liveTheEngineRanksTestModeStillAppliesAndPostgresHasTheLastWord() {
        UUID busy = FleetDispatchFixtures.riderOnShift(fleet, "+919800000004", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'PICKED_UP' WHERE id = ?", busy, fleet.trip(UUID.randomUUID()));
        UUID notListed = FleetDispatchFixtures.riderOnShift(fleet, "+919800000005", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("DELETE FROM fleet_schema.test_mode_rider WHERE rider_id = ?", notListed);
        // The engine's order: third first (fewest rupees an hour in the band), then riders whose state it saw a moment ago.
        when(engine.rank(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), anyInt())).thenReturn(Optional.of(List.of(
            new Candidate(third, 1_113, KITCHEN_LAT + 0.010, KITCHEN_LNG, true, 12_000, System.currentTimeMillis() - 600_000, 0, true),
            new Candidate(notListed, 5, KITCHEN_LAT, KITCHEN_LNG, false, 0, 0, 0, true),
            new Candidate(busy, 5, KITCHEN_LAT, KITCHEN_LNG, false, 0, 0, 0, true),
            new Candidate(near, 111, KITCHEN_LAT + 0.001, KITCHEN_LNG, false, 0, 0, 0, false))));

        assertThatThrownBy(() -> dispatcher(false, true, true).run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);

        List<Map<String, Object>> offers = fleet.db.queryForList("SELECT rider_id, reason->>'rule' AS rule, (reason->>'place')::int AS place, "
            + "(reason->>'earnedPerHourPaise')::bigint AS per_hour, (reason->>'atOnce')::int AS at_once FROM fleet_schema.trip_offer "
            + "WHERE state = 'ACTIVE' ORDER BY (reason->>'place')::int");
        assertThat(offers).extracting(offer -> offer.get("rider_id")).as("not the rider test mode leaves out, nor the one on a trip")
            .containsExactly(third, near);
        assertThat(offers.get(0)).containsEntry("rule", "FAIR").containsEntry("place", 1).containsEntry("per_hour", 12_000L);
        assertThat(offers.get(1)).containsEntry("rule", "NEAREST").containsEntry("at_once", 2);

        ArgumentCaptor<FleetEngineWire.Policy> policy = ArgumentCaptor.forClass(FleetEngineWire.Policy.class);
        verify(engine).rank(eq(chefSubOrderId), eq(KITCHEN_LAT), eq(KITCHEN_LNG), eq(17.46), eq(78.36), eq(3500), policy.capture(), eq(Set.of()),
            eq(1));
        assertThat(policy.getValue()).isEqualTo(new FleetEngineWire.Policy(5_000, 130, 3, 0, 40, false, false));
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<UUID>> offered = ArgumentCaptor.forClass(Collection.class);
        verify(feed).refresh(offered.capture());
        assertThat(offered.getValue()).as("the engine reads the riders just offered again").containsExactlyInAnyOrder(third, near);
        verify(feed, never()).shadow(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), any(), anyInt());
    }

    @Test
    void anEngineAnswerWhoseRidersAreNoLongerFreeIsPassedOverForJavasOwnRanking() {
        // The engine still sees these as free: one just accepted a trip, the other was suspended a moment ago.
        UUID busy = FleetDispatchFixtures.riderOnShift(fleet, "+919800000006", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'ASSIGNED' WHERE id = ?", busy, fleet.trip(UUID.randomUUID()));
        UUID suspended = FleetDispatchFixtures.riderOnShift(fleet, "+919800000007", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'SUSPENDED' WHERE id = ?", suspended);
        when(engine.rank(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), anyInt())).thenReturn(Optional.of(List.of(
            new Candidate(busy, 5, KITCHEN_LAT, KITCHEN_LNG, false, 0, 0, 0, true),
            new Candidate(suspended, 5, KITCHEN_LAT, KITCHEN_LNG, false, 0, 0, 0, true))));

        assertThatThrownBy(() -> dispatcher(false, true, true).run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(offeredRiders()).as("the order still reaches free riders this round, not a courier")
            .containsExactlyInAnyOrder(near, second, third);
    }

    @Test
    void withoutAnAnswerFromTheEngineDispatchRanksRidersItself() {
        when(engine.rank(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), anyInt())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> dispatcher(false, true, true).run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(offeredRiders()).containsExactlyInAnyOrder(near, second, third);
    }

    @Test
    void anEngineThatFindsNobodyIsCheckedByJavasOwnRanking() {
        when(engine.rank(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), anyInt())).thenReturn(Optional.of(List.of()));
        assertThatThrownBy(() -> dispatcher(false, true, true).run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(offeredRiders()).containsExactlyInAnyOrder(near, second, third);
    }

    @Test
    void inShadowTheEngineHearsJavasRankingToCompare() {
        assertThatThrownBy(() -> dispatcher(false, true, false).run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(offeredRiders()).containsExactlyInAnyOrder(near, second, third);
        verify(engine, never()).rank(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), anyInt());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Candidate>> ranked = ArgumentCaptor.forClass(List.class);
        verify(feed).shadow(eq(chefSubOrderId), eq(KITCHEN_LAT), eq(KITCHEN_LNG), eq(17.46), eq(78.36), eq(3500), any(), eq(Set.of()),
            ranked.capture(), eq(1));
        assertThat(ranked.getValue()).extracting(Candidate::riderId).containsExactly(near, second, third);
        assertThat(ranked.getValue().get(0).straightLineM()).isBetween(110.0, 112.0);
    }

    @Test
    void roadRankingKeepsTheEngineOut() {
        assertThatThrownBy(() -> dispatcher(true, true, true).run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        verify(engine, never()).rank(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), anyInt());
        verify(feed, never()).shadow(any(), anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyInt(), any(), any(), any(), anyInt());
    }

    FleetDispatcher dispatcher(boolean roadRanking, boolean feedOn, boolean live) {
        FleetDispatcher dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, new FleetPolicyStore(fleet.db, json),
            new FleetTestMode(fleet.db, FleetDatabase.properties(true)), roads, push, json, roadRanking, false);
        when(feed.on()).thenReturn(feedOn);
        when(engine.live()).thenReturn(live);
        dispatcher.setEngine(feed, engine);
        return dispatcher;
    }

    List<UUID> offeredRiders() {
        return fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer WHERE state = 'ACTIVE'", UUID.class);
    }
}
