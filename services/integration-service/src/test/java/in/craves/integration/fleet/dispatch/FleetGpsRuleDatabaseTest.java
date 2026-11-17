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
 * CRAVES_FLEET_GPS_RULE (R22 9): a fix under 60 s old and accurate to 250 m. Off and shadow ask the riders today's rule
 * asks; shadow counts who the rule would leave out; enforce leaves them out, records nothing, and they keep their turn.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetGpsRuleDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final RoadDistanceClient roads = mock(RoadDistanceClient.class);
    /**
     * The FLEET_GPS_RULE lines. Offer pushes log on the same logger from their own threads (this class's, and ones still
     * running from classes before it), so the lines are kept in a list that is safe to read while it is written.
     */
    final List<String> gpsLines = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            if (event.getFormattedMessage().startsWith("FLEET_GPS_RULE")) {
                gpsLines.add(event.getFormattedMessage());
            }
        }
    };
    final FleetDispatcher dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, new FleetPolicyStore(fleet.db, json),
        new FleetTestMode(fleet.db, FleetDatabase.properties(true)), roads, mock(RiderPushClient.class), json);

    @BeforeEach
    void setUp() {
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        logged.start();
        ((Logger) LoggerFactory.getLogger(FleetDispatcher.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(FleetDispatcher.class)).detachAppender(logged);
    }

    @Test
    void offAndShadowAskAsTodayShadowCountsAndEnforceLeavesOutUntilAFreshAccurateFix() {
        FleetDispatchFixtures.policy(fleet.db, "live"); // three riders at once, nearest first
        UUID oldFix = rider(1, 0.001, 120, 8);
        UUID coarse = rider(2, 0.002, 5, 400);
        UUID oldAndCoarse = rider(3, 0.003, 120, 400);
        UUID good = rider(4, 0.004, 5, 250);

        assertThatThrownBy(() -> dispatcher.setGpsRule("on")).isInstanceOf(IllegalStateException.class);
        dispatcher.setGpsRule(" ");
        assertThat(asked()).as("off: today's rule, a call in 45 s and a fix under 3 minutes").containsExactly(oldFix, coarse, oldAndCoarse);
        assertThat(gpsLines()).isEmpty();

        dispatcher.setGpsRule(" Shadow ");
        UUID counted = UUID.randomUUID();
        assertThat(asked(counted)).as("shadow asks the same riders").containsExactly(oldFix, coarse, oldAndCoarse);
        assertThat(gpsLines()).containsExactly(
            "FLEET_GPS_RULE mode=shadow chefSubOrderId=" + counted + " round=1 passing=1 stale=1 inaccurate=1 both=1");

        dispatcher.setGpsRule("enforce");
        gpsLines.clear();
        UUID enforced = UUID.randomUUID();
        assertThat(asked(enforced)).as("enforce: only the rider with a fresh, accurate fix").containsExactly(good);
        assertThat(gpsLines()).containsExactly(
            "FLEET_GPS_RULE mode=enforce chefSubOrderId=" + enforced + " round=1 passing=1 stale=1 inaccurate=1 both=1");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_shift WHERE ended_at IS NULL", Integer.class))
            .as("everyone stays on shift").isEqualTo(4);

        for (UUID rider : List.of(oldFix, coarse, oldAndCoarse)) {
            fleet.db.update("UPDATE fleet_schema.rider_position_latest SET recorded_at = now(), accuracy_m = 30 WHERE rider_id = ?", rider);
        }
        gpsLines.clear();
        assertThat(asked()).as("asked again with the next fresh, accurate fix").containsExactly(oldFix, coarse, oldAndCoarse);
        assertThat(gpsLines()).as("a look that leaves nobody out logs nothing").isEmpty();
    }

    /**
     * Left out is not a decline or an ask: no offer row, and the rider's fair turn is what it was. Three riders in the band
     * with equal pay, so the one free the longest hears first.
     */
    @Test
    void aRiderLeftOutHasNothingRecordedAndKeepsTheirFairTurn() {
        FleetDispatchFixtures.policy(fleet.db, "live", 20, 90, 1, 3, 1500); // one at a time, fair turns within 1.5 km
        UUID nearest = rider(1, 0.001, 5, 8);
        UUID longestFree = rider(2, 0.005, 120, 8);
        UUID middle = rider(3, 0.003, 5, 8);
        freeFor(nearest, 10);
        freeFor(longestFree, 60);
        freeFor(middle, 30);
        dispatcher.setGpsRule("enforce");
        UUID order = UUID.randomUUID();
        FleetDispatchFixtures.kitchen(fleet.db, order, true);
        var command = FleetDispatchFixtures.command(order);

        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer", UUID.class))
            .as("the rider free the longest has an old fix: the next in turn is asked, and no row is written for them")
            .containsExactly(middle);

        FleetDispatchFixtures.fix(fleet.db, longestFree, KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now()");
        assertThatThrownBy(() -> dispatcher.run(command, () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(fleet.db.queryForList("SELECT state || ' ' || (reason->>'rule') || ' place ' || (reason->>'place') || ' of ' "
            + "|| (reason->>'riders') || ' free ' || (reason->>'freeMinutes') FROM fleet_schema.trip_offer WHERE rider_id = ?", String.class,
            longestFree)).as("their first and only offer, ahead of the nearest rider, with the hour they have waited")
            .containsExactly("ACTIVE FAIR place 1 of 2 free 60");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer WHERE rider_id = ?", Integer.class, nearest)).isZero();
    }

    private void freeFor(UUID rider, int minutes) {
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - make_interval(mins => ?) WHERE rider_id = ?", minutes, rider);
    }

    /**
     * Enforced, the rule decides only whom to offer to. Whether riders are near (the quote routing reads) is today's
     * answer, and under the owner's rule the order keeps its stage and waits for the rider's next fresh fix.
     */
    @Test
    void enforcedARiderWithAnOldFixStillCountsAsNearAndTheOrderWaitsForTheirFreshFix() {
        FleetDispatchFixtures.policy(fleet.db, "live", 20, 300, 1, 0, 0); // the owner's rule: no limit on rounds, 300 s
        UUID rider = rider(1, 0.001, 120, 8);
        dispatcher.setGpsRule("enforce");
        UUID order = UUID.randomUUID();
        FleetDispatchFixtures.kitchen(fleet.db, order, true);
        var command = FleetDispatchFixtures.command(order);

        assertThat(dispatcher.ridersNear(KITCHEN_LAT, KITCHEN_LNG)).as("ops' count is today's").isOne();
        assertThat(new CravesFleetAdapter(dispatcher, mock(FleetTripService.class), mock(FleetStatusBridge.class), json)
            .quote(command.deliveryRequest()).available()).as("the fleet quote is still available").isTrue();
        for (int look = 1; look <= 2; look++) {
            assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true)).as("the stage opens and stays open")
                .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
            assertThat(fleet.db.queryForList("SELECT state FROM fleet_schema.trip_stage", String.class)).containsExactly("OPEN");
            assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer", Integer.class)).isZero();
        }

        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer WHERE state = 'ACTIVE'", UUID.class))
            .as("offered in the same stage").containsExactly(rider);
        assertThat(fleet.db.queryForList("SELECT state FROM fleet_schema.trip_stage", String.class)).containsExactly("OPEN");
    }

    /** A rider on shift, heard from 5 s ago, whose newest fix is this old and this accurate. */
    private UUID rider(int n, double north, int fixSecondsAgo, int accuracyM) {
        UUID rider = FleetDispatchFixtures.riderOnShift(fleet, "+91980000000" + n, KITCHEN_LAT + north, KITCHEN_LNG, fixSecondsAgo, false);
        FleetDispatchFixtures.seen(fleet.db, rider, 5);
        fleet.db.update("UPDATE fleet_schema.rider_position_latest SET accuracy_m = ? WHERE rider_id = ?", accuracyM, rider);
        return rider;
    }

    private List<UUID> asked() {
        return asked(UUID.randomUUID());
    }

    /** The riders a new order's first look asks, nearest first; earlier orders' offers are cleared so every rider is free. */
    private List<UUID> asked(UUID order) {
        fleet.db.update("DELETE FROM fleet_schema.trip_offer");
        FleetDispatchFixtures.kitchen(fleet.db, order, true);
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(order), () -> OptionalLong.of(9000), true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        return fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer ORDER BY (reason->>'place')::int", UUID.class);
    }

    private List<String> gpsLines() {
        return List.copyOf(gpsLines);
    }
}
