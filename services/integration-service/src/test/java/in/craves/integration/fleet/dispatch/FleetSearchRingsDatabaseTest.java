package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.trip.FleetStatusBridge;
import in.craves.integration.fleet.trip.FleetTripService;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;

/**
 * Search rings (R22 3-3, V198; docs/riders/DISPATCH.md §2): a policy without them asks as before; with them, riders nearer
 * the kitchen are asked first and farther ones as the stage ages, in the same fair order, the same riders asked again.
 * Rings 2 km until 100 s, then 3.5 km until 200 s, then the 5 km radius. No sleeps: the stage and its offers are moved back.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetSearchRingsDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final RoadDistanceClient roads = mock(RoadDistanceClient.class);
    /** The FLEET_SEARCH_RING lines; offer pushes log on the same logger from their own threads, so a list safe to read meanwhile. */
    final List<String> ringLines = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            if (event.getFormattedMessage().startsWith("FLEET_SEARCH_RING")) {
                ringLines.add(event.getFormattedMessage());
            }
        }
    };
    final FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
    final FleetTestMode testMode = new FleetTestMode(fleet.db, FleetDatabase.properties(true));
    final FleetDispatcher dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies, testMode, roads,
        mock(RiderPushClient.class), json);
    final UUID order = UUID.fromString("0bde0303-3333-4333-8333-333333333333");
    final DeliveryCommandMessage command = FleetDispatchFixtures.command(order);

    @BeforeEach
    void setUp() {
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        FleetDispatchFixtures.kitchen(fleet.db, order, true);
        logged.start();
        ((Logger) LoggerFactory.getLogger(FleetDispatcher.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(FleetDispatcher.class)).detachAppender(logged);
    }

    /** Every policy version so far: the ring columns at their default. Nearest first across the whole radius, then again. */
    @Test
    void withoutRingsEveryRiderInTheRadiusIsAskedNearestFirstFromTheStartAsBefore() {
        FleetDispatchFixtures.policy(fleet.db, "live", 20, 300, 1, 0, 0); // the columns are not named: their defaults
        assertThat(policies.currentDispatchPolicy().orElseThrow().rings()).isEqualTo(FleetPolicyStore.SearchRings.NONE);
        List<UUID> riders = fourRiders();

        look();
        for (int age : List.of(30, 60, 100, 130, 200)) {
            declinedAndTheStageIs(age);
            look();
        }
        assertThat(asked()).containsExactly(riders.get(0), riders.get(1), riders.get(2), riders.get(3), riders.get(0), riders.get(1));
        assertThat(List.copyOf(ringLines)).isEmpty();
    }

    @Test
    void withRingsNearerRidersAreAskedFirstAndAgainAndFartherOnesOnceTheirRingOpens() {
        FleetDispatchFixtures.policyWithRings(fleet.db, 20, 300, 0, 2000, 100, 3500, 200);
        List<UUID> riders = fourRiders();
        UUID a = riders.get(0);
        UUID b = riders.get(1);
        UUID c = riders.get(2);
        UUID d = riders.get(3);
        assertThat(dispatcher.ridersNear(KITCHEN_LAT, KITCHEN_LNG)).as("whether riders are near is the whole radius").isEqualTo(4);
        assertThat(new CravesFleetAdapter(dispatcher, mock(FleetTripService.class), mock(FleetStatusBridge.class), json)
            .quote(command.deliveryRequest()).available()).isTrue();

        look();
        assertThat(List.copyOf(ringLines)).containsExactly("FLEET_SEARCH_RING chefSubOrderId=" + order
            + " round=1 stageAgeSeconds=0 ringM=2000 radiusM=5000 inRing=2 beyond=2");
        declinedAndTheStageIs(30);
        look();
        declinedAndTheStageIs(60);
        look();
        assertThat(asked()).as("the first 100 s: the two riders within 2 km, and the first again").containsExactly(a, b, a);
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer WHERE rider_id IN (?, ?)", Integer.class, c, d))
            .as("a rider outside the ring has nothing recorded").isZero();

        declinedAndTheStageIs(100);
        look();
        declinedAndTheStageIs(130);
        look();
        assertThat(asked()).as("from 100 s the rider within 3.5 km, not yet asked, hears first; then the others in turn")
            .containsExactly(a, b, a, c, b);

        declinedAndTheStageIs(200);
        ringLines.clear();
        look();
        declinedAndTheStageIs(230);
        look();
        declinedAndTheStageIs(260);
        look();
        assertThat(asked()).as("from 200 s the whole radius").containsExactly(a, b, a, c, b, d, c, d);
        assertThat(List.copyOf(ringLines)).as("no ring any more").isEmpty();
        assertThat(fleet.db.queryForList("SELECT DISTINCT state FROM fleet_schema.trip_stage", String.class)).containsExactly("OPEN");
    }

    /**
     * Fair turns are drawn inside the ring as they are inside the radius: the rider free the longest hears first. A rider
     * who chose a nearer pickup is left out as before, and does not hold a ring for an order they would never hear of: a
     * ring nobody free is in is passed over at once.
     */
    @Test
    void fairTurnsAndARidersOwnDistanceLimitHoldInsideTheRingAndAnEmptyRingIsPassedOverAtOnce() {
        FleetDispatcher choices = new FleetDispatcher(fleet.db, fleet.transactions, policies, testMode, roads, mock(RiderPushClient.class),
            json, false, true, 0);
        FleetDispatchFixtures.policyWithRings(fleet.db, 20, 300, 1500, 2000, 100, 3500, 200);
        UUID nearest = rider(1, 0.008); // 0.9 km by straight line, 1.2 km as the offer shows it
        UUID longestFree = rider(2, 0.010);
        UUID outside = rider(3, 0.027);
        freeFor(nearest, 10);
        freeFor(longestFree, 50);
        freeFor(outside, 60);

        assertThatThrownBy(() -> choices.run(command, OptionalLong::empty, true)).isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(fleet.db.queryForList("SELECT (reason->>'rule') || ' place ' || (reason->>'place') || ' of ' || (reason->>'riders') "
            + "FROM fleet_schema.trip_offer WHERE rider_id = ?", String.class, longestFree)).containsExactly("FAIR place 1 of 2");
        assertThat(asked()).as("the rider 3 km away, free longer still, is outside the ring").containsExactly(longestFree);

        fleet.db.update("UPDATE fleet_schema.rider SET max_pickup_m = 1000 WHERE id IN (?, ?)", nearest, longestFree);
        declinedAndTheStageIs(30);
        assertThatThrownBy(() -> choices.run(command, OptionalLong::empty, true)).isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(asked()).as("30 s in, nobody within 2 km would take it: the rider 3 km away is asked now, not at 100 s")
            .containsExactly(longestFree, outside);
    }

    /**
     * The no-supply fast path asks whether any rider is in the policy radius, never the ring: a rider on a break 3 km away
     * keeps the order's stage though the first ring is empty. Only with nobody in the radius does the courier come next.
     */
    @Test
    void theNoSupplyFastPathLooksAtTheWholeRadiusNotTheRing() {
        FleetDispatchFixtures.policyWithRings(fleet.db, 20, 300, 0, 2000, 100, 3500, 200);
        dispatcher.setNoSupplyFastPath(true, 3);
        UUID onBreak = rider(1, 0.027);
        FleetDispatchFixtures.onBreak(fleet.db, onBreak, 5, 20);

        look();
        declinedAndTheStageIs(10);
        look();
        assertThat(fleet.db.queryForList("SELECT state FROM fleet_schema.trip_stage", String.class)).containsExactly("OPEN");
        assertThat(asked()).isEmpty();

        FleetDispatchFixtures.fix(fleet.db, onBreak, KITCHEN_LAT + 0.060, KITCHEN_LNG, 5, false);
        assertThat(dispatcher.run(command, OptionalLong::empty, true)).as("nobody in the radius: the courier is next").isEmpty();
        assertThat(fleet.db.queryForList("SELECT provider || ':' || state || ':' || COALESCE(outcome, '') FROM fleet_schema.trip_stage "
            + "ORDER BY opened_at", String.class)).containsExactly("CRAVES_FLEET:CLOSED:NO_SUPPLY", "BORZO:OPEN:");
    }

    /** Riders 0.55, 1.1, 3.0 and 4.5 km north of the kitchen. */
    private List<UUID> fourRiders() {
        return List.of(rider(1, 0.005), rider(2, 0.010), rider(3, 0.027), rider(4, 0.040));
    }

    private UUID rider(int n, double north) {
        return FleetDispatchFixtures.riderOnShift(fleet, "+91980000000" + n, KITCHEN_LAT + north, KITCHEN_LNG, 5, false);
    }

    private void freeFor(UUID rider, int minutes) {
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - make_interval(mins => ?) WHERE rider_id = ?", minutes, rider);
    }

    /** One look at the order; riders are asked first for the whole stage, so it always waits. */
    private void look() {
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
    }

    /** The open offer is declined, 30 s pass for every offer (so its rider may be asked again), and the stage is this old. */
    private void declinedAndTheStageIs(int ageSeconds) {
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE state = 'ACTIVE'");
        fleet.db.update("UPDATE fleet_schema.trip_offer SET offered_at = offered_at - INTERVAL '30 seconds', "
            + "expires_at = expires_at - INTERVAL '30 seconds', decided_at = decided_at - INTERVAL '30 seconds'");
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - make_interval(secs => ?) WHERE provider = 'CRAVES_FLEET'",
            ageSeconds);
    }

    private List<UUID> asked() {
        return fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer ORDER BY round", UUID.class);
    }
}
