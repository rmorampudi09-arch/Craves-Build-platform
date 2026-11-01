package in.craves.integration.fleet.engine;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.fleet.engine.EngineStreams.Entry;
import in.craves.integration.fleet.engine.FleetEngineWire.Fix;
import in.craves.integration.fleet.engine.FleetEngineWire.Policy;
import in.craves.integration.fleet.engine.FleetEngineWire.RiderEvent;
import in.craves.integration.fleet.engine.FleetEngineWire.State;
import in.craves.integration.fleet.rider.FleetLocationService;
import in.craves.integration.fleet.rider.FleetRiderModels.DeviceHealth;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Phase 5, the fleet engine's feed against a real database: a rider is read as FleetDispatcher reads them, events leave
 * only after their transaction commits, each on its partition's stream, and nothing a rider does ever waits on Redis.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetEngineFeedDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final FakeStreams streams = new FakeStreams();
    final FleetEngineFeed feed = feed("shadow", 10_000, streams);
    final UUID identity = UUID.randomUUID();
    UUID rider;
    UUID shift;
    UUID offeredTrip;

    @BeforeEach
    void setUp() {
        rider = fleet.rider("Ravi Kumar", "+919876543210");
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE', identity_id = ?, home_lat = 17.47, home_lng = 78.35, "
            + "home_saved_at = now(), max_pickup_m = 2000 WHERE id = ?", identity, rider);
        fleet.db.update("INSERT INTO fleet_schema.test_mode_rider (rider_id) VALUES (?)", rider);
        shift = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at, last_seen_at, "
            + "can_ring, heading_home_until) VALUES (?, ?, ?, now() + INTERVAL '11 hours', now() - INTERVAL '1 hour', now() - INTERVAL '10 seconds', "
            + "false, now() + INTERVAL '30 minutes')", shift, rider, "a".repeat(64));
        FleetDispatchFixtures.fix(fleet.db, rider, KITCHEN_LAT, KITCHEN_LNG, 20, false);
        UUID delivered = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'DELIVERED', finished_at = now() - INTERVAL '30 minutes' WHERE id = ?",
            rider, delivered);
        offeredTrip = fleet.trip(UUID.randomUUID());
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, pay_paise, rate_card_version, pickup_distance_m, "
            + "drop_distance_m, offered_at, expires_at) VALUES (?, ?, ?, 5350, '2026-10-v1', 144, 3500, now() - INTERVAL '5 seconds', "
            + "now() + INTERVAL '35 seconds')", UUID.randomUUID(), offeredTrip, rider);
    }

    @Test
    void aRiderIsReadExactlyAsDispatchReadsThem() {
        FleetDatabase.assumeTodayIsHoursOld(2);
        RiderEvent event = feed.snapshot(List.of(rider), List.of()).get(0);
        Map<String, Object> db = fleet.db.queryForMap("SELECT s.credential_expires_at, s.heading_home_until, s.last_seen_at, o.offered_at, "
            + "o.expires_at, p.recorded_at, t.finished_at FROM fleet_schema.rider_shift s JOIN fleet_schema.trip_offer o ON o.rider_id = s.rider_id "
            + "JOIN fleet_schema.rider_position_latest p ON p.rider_id = s.rider_id JOIN fleet_schema.trip t ON t.rider_id = s.rider_id "
            + "AND t.state = 'DELIVERED' WHERE s.id = ?", shift);
        assertThat(event.kind()).isEqualTo(FleetEngineWire.REFRESH);
        assertThat(event.riderId()).isEqualTo(rider);
        assertThat(event.atMs()).isCloseTo(System.currentTimeMillis(), within(5_000L));
        assertThat(event.state()).isEqualTo(new State(shift, ms(db, "credential_expires_at"), true, false, ms(db, "expires_at"), 0, true, 2_000, 0,
            17.47, 78.35, ms(db, "heading_home_until"), true, ms(db, "last_seen_at"),
            new Fix(KITCHEN_LAT, KITCHEN_LNG, ms(db, "recorded_at"), false, 8f), ms(db, "offered_at")));
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        assertThat(event.standing().istDay()).isEqualTo(today.getYear() * 10_000 + today.getMonthValue() * 100 + today.getDayOfMonth());
        assertThat(event.standing().earnedPaise()).isZero();
        assertThat(event.standing().onlineSeconds()).as("the hour online so far").isBetween(3_590L, 3_610L);
        assertThat(event.standing().accruing()).as("on a shift, no break: online time keeps growing").isTrue();
        assertThat(event.standing().freeSinceMs()).as("free since the last trip ended, after the shift began").isEqualTo(ms(db, "finished_at"));

        FleetDispatchFixtures.onBreak(fleet.db, rider, 1, 9);
        RiderEvent onBreak = feed.snapshot(List.of(), List.of(identity)).get(0);
        assertThat(onBreak.state().breakUntilMs()).as("read by identity too").isGreaterThan(System.currentTimeMillis() + 500_000);
        assertThat(onBreak.standing().accruing()).as("a break is not time online").isFalse();

        fleet.db.update("UPDATE fleet_schema.rider_shift SET heading_home_until = NULL WHERE id = ?", shift);
        State notHeadingHome = feed.snapshot(List.of(rider), List.of()).get(0).state();
        assertThat(notHeadingHome.homeLat()).as("the home spot goes to Redis only while heading home uses it").isNull();
        assertThat(notHeadingHome.homeLng()).isNull();
    }

    @Test
    void aRiderWithoutAWorkingShiftGoesOffline() {
        fleet.db.update("UPDATE fleet_schema.rider_shift SET credential_expires_at = now() - INTERVAL '1 second' WHERE id = ?", shift);
        assertThat(feed.snapshot(List.of(rider), List.of())).singleElement()
            .satisfies(event -> assertThat(event.kind()).as("an expired credential is no shift").isEqualTo(FleetEngineWire.OFFLINE));
        fleet.db.update("UPDATE fleet_schema.rider_shift SET ended_at = now(), credential_expires_at = now() + INTERVAL '1 hour' WHERE id = ?", shift);
        assertThat(feed.snapshot(List.of(), List.of(identity))).singleElement().satisfies(event -> {
            assertThat(event.kind()).isEqualTo(FleetEngineWire.OFFLINE);
            assertThat(event.state()).isNull();
        });
        assertThat(feed.snapshot(List.of(UUID.randomUUID()), List.of())).as("nobody: nothing to say").isEmpty();
    }

    @Test
    void anEventLeavesOnlyOnceItsTransactionCommitsOnItsRidersStream() {
        TransactionTemplate transaction = new TransactionTemplate(fleet.transactions);
        transaction.executeWithoutResult(status -> {
            feed.refresh(rider);
            status.setRollbackOnly();
        });
        feed.flush();
        assertThat(streams.entries).as("rolled back: the engine never hears of it").isEmpty();

        transaction.executeWithoutResult(status -> feed.refresh(rider));
        feed.flush();
        assertThat(streams.entries).singleElement().satisfies(entry -> {
            assertThat(entry.stream()).isEqualTo("craves:fleet:rq:{rq" + FleetEngineWire.partition(rider, 16) + "}");
            assertThat(HexFormat.of().formatHex(entry.payload())).as("the rider, then REFRESH")
                .startsWith("0a10" + HexFormat.of().formatHex(FleetEngineWire.bytes(rider)) + "1002");
        });
    }

    @Test
    void aFullQueueDropsEventsRatherThanMakeARiderWaitAndRedisTroubleIsCountedNotThrown() {
        FleetEngineFeed small = feed("live", 100, streams);
        for (int i = 0; i < 101; i++) {
            small.refresh(rider);
        }
        assertThat(small.dropped()).isEqualTo(1);
        streams.failure = new IllegalStateException("Redis did not answer in time");
        small.flush();
        assertThat(streams.entries).isEmpty();
        streams.failure = null;
        small.refresh(rider);
        small.flush();
        assertThat(streams.entries).as("the same rider queued many times is read once").hasSize(1);
    }

    @Test
    void theSweepReadsEveryRiderOnAShiftAndTestModeIsApplied() {
        UUID other = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("DELETE FROM fleet_schema.test_mode_rider WHERE rider_id = ?", other);
        feed.sweepNow();
        feed.flush();
        assertThat(streams.entries).hasSize(2);

        State state = new State(shift, 1, true, false, 0, 0, false, 0, 0, null, null, 0, false, 1, null, 0);
        Instant at = Instant.now();
        feed.ping(rider, at, List.of(), state);
        feed.ping(other, at, List.of(), state);
        feed.flush();
        assertThat(streams.entries.subList(2, 4)).extracting(entry -> HexFormat.of().formatHex(entry.payload())).containsExactly(
            HexFormat.of().formatHex(FleetEngineWire.encode(new RiderEvent(rider, FleetEngineWire.PING, at.toEpochMilli(), List.of(),
                state.allowed(true), null))),
            HexFormat.of().formatHex(FleetEngineWire.encode(new RiderEvent(other, FleetEngineWire.PING, at.toEpochMilli(), List.of(),
                state.allowed(false), null))));
    }

    @Test
    void aShadowRequestGoesToTheStreamOfTheKitchensBlock() {
        UUID order = UUID.randomUUID();
        feed.shadow(order, KITCHEN_LAT, KITCHEN_LNG, 17.46, 78.36, 3_500, new Policy(5_000, 130, 3, 0, 40, false, false, false, ""), Set.of(),
            List.of(), 1);
        feed.flush();
        assertThat(streams.entries).singleElement().satisfies(entry ->
            assertThat(entry.stream()).as("vectors.json: this kitchen's block is in partition 13").isEqualTo("craves:fleet:dq:{dq13}"));
    }

    @Test
    void offTheFeedTouchesNeitherPostgresNorRedis() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        EngineStreams redis = mock(EngineStreams.class);
        FleetEngineFeed off = new FleetEngineFeed(jdbc, new FleetEngineProperties("off", false, 16, 16, 120, 300, 10_000, null),
            FleetDatabase.properties(true), redis, true);
        assertThat(off.on()).isFalse();
        off.refresh(rider);
        off.refreshIdentity(identity);
        off.ping(rider, Instant.now(), List.of(), null);
        off.shadow(UUID.randomUUID(), 1, 2, 3, 4, 5, null, Set.of(), List.of(), 1);
        verifyNoInteractions(jdbc, redis);
    }

    @Test
    void eachLocationsCallPingsTheEngineWithTheShiftAsTheCallLeftIt() {
        FleetEngineFeed pings = mock(FleetEngineFeed.class);
        when(pings.on()).thenReturn(true);
        FleetLocationService locations = new FleetLocationService(fleet.db, new ObjectMapper(), FleetDatabase.properties(true));
        locations.setEngineFeed(pings);
        Instant taken = Instant.now().minusSeconds(3).truncatedTo(ChronoUnit.MILLIS);
        locations.ingest(identity, null, new LocationBatch(List.of(new RiderFix(17.4490, 78.3920, 6.5, taken, false))));

        ArgumentCaptor<Instant> at = ArgumentCaptor.forClass(Instant.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Fix>> fixes = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<State> state = ArgumentCaptor.forClass(State.class);
        verify(pings).ping(eq(rider), at.capture(), fixes.capture(), state.capture());
        Map<String, Object> db = fleet.db.queryForMap("SELECT s.credential_expires_at, s.heading_home_until, o.offered_at, o.expires_at "
            + "FROM fleet_schema.rider_shift s JOIN fleet_schema.trip_offer o ON o.rider_id = s.rider_id WHERE s.id = ?", shift);
        assertThat(fixes.getValue()).containsExactly(new Fix(17.4490, 78.3920, taken.toEpochMilli(), false, 6.5f));
        assertThat(state.getValue()).isEqualTo(new State(shift, ms(db, "credential_expires_at"), true, false, ms(db, "expires_at"), 0, true,
            2_000, 0, 17.47, 78.35, ms(db, "heading_home_until"), false, at.getValue().toEpochMilli(), null, ms(db, "offered_at")));

        // The phone says it can ring now: the engine hears so from this very call (the heartbeat's own update).
        locations.ingest(identity, null, new LocationBatch(List.of(), null, new DeviceHealth(80, false, false, true, null, null, null, null, null)));
        verify(pings, times(2)).ping(eq(rider), any(), any(), state.capture());
        assertThat(state.getValue().cannotRing()).isFalse();

        // Heading home over, the spot stays out of the ping.
        fleet.db.update("UPDATE fleet_schema.rider_shift SET heading_home_until = NULL WHERE id = ?", shift);
        locations.ingest(identity, null, new LocationBatch(List.of()));
        verify(pings, times(3)).ping(eq(rider), any(), any(), state.capture());
        assertThat(state.getValue().homeLat()).isNull();
        assertThat(state.getValue().homeLng()).isNull();

        // Its credential revoked, the shift stops: the engine reads the rider again (OFFLINE) once that commits.
        fleet.db.update("UPDATE fleet_schema.rider_shift SET credential_revoked_at = now() WHERE id = ?", shift);
        locations.ingest(identity, null, new LocationBatch(List.of()));
        verify(pings).refresh(rider);
    }

    FleetEngineFeed feed(String mode, int queueCapacity, EngineStreams redis) {
        return new FleetEngineFeed(fleet.db, new FleetEngineProperties(mode, false, 16, 16, 120, 300, queueCapacity, null),
            FleetDatabase.properties(true), redis, false);
    }

    static long ms(Map<String, Object> row, String column) {
        return ((Timestamp) row.get(column)).toInstant().toEpochMilli();
    }

    /** Redis as the feed and the client use it, in memory. */
    static final class FakeStreams implements EngineStreams {
        final List<Entry> entries = new ArrayList<>();
        final Map<String, byte[]> values = new java.util.concurrent.ConcurrentHashMap<>();
        volatile RuntimeException failure;

        @Override
        public synchronized void append(List<Entry> batch, Duration keep, Duration wait) {
            if (failure != null) {
                throw failure;
            }
            entries.addAll(batch);
        }

        @Override
        public byte[] get(String key, Duration wait) {
            if (failure != null) {
                throw failure;
            }
            return values.get(key);
        }

        @Override
        public void set(String key, byte[] value, Duration keep, Duration wait) {
            if (failure != null) {
                throw failure;
            }
            values.put(key, value);
        }
    }
}
