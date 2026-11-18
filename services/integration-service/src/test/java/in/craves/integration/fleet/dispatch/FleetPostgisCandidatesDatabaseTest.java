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
import in.craves.integration.fleet.dispatch.FleetDispatcher.Candidate;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * CRAVES_FLEET_POSTGIS_CANDIDATES (R22 #4): on asks the same riders in the same order as off; shadow asks as off and logs
 * counts; without PostGIS it runs as off. Riders are stored first; everything that creates the index, or drops the
 * extension, then runs on one connection in a transaction that is rolled back.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPostgisCandidatesDatabaseTest {
    /** Great-circle metres a degree of latitude, as RoadDistanceClient.straightLineMetres counts them. */
    static final double METRES_A_DEGREE = Math.toRadians(1) * 6_371_000;
    static final String SHADOW_LINE = "FLEET_POSTGIS_CANDIDATES mode=shadow today=\\d+ postgis=\\d+ missing=0 extra=0 sameOrder=true "
        + "todayMicros=\\d+ postgisMicros=\\d+";

    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final AtomicInteger statements = new AtomicInteger();
    final Thread looking = Thread.currentThread();
    /** As FleetDispatchStatementsDatabaseTest counts: every statement this thread prepares. */
    final DataSource counted = new DelegatingDataSource(fleet.dataSource) {
        @Override
        public Connection getConnection() throws SQLException {
            Connection connection = super.getConnection();
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class},
                (proxy, method, args) -> {
                    if (Thread.currentThread() == looking
                        && (method.getName().startsWith("prepare") || method.getName().equals("createStatement"))) {
                        statements.incrementAndGet();
                    }
                    try {
                        return method.invoke(connection, args);
                    } catch (InvocationTargetException exception) {
                        throw exception.getCause();
                    }
                });
        }
    };
    final JdbcTemplate db = new JdbcTemplate(counted);
    final DataSourceTransactionManager transactions = new DataSourceTransactionManager(counted);
    final RoadDistanceClient roads = mock(RoadDistanceClient.class);
    final List<String> lines = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            if (event.getFormattedMessage().startsWith("FLEET_POSTGIS_CANDIDATES")) {
                lines.add(event.getFormattedMessage());
            }
        }
    };
    final UUID order = UUID.fromString("0bde0302-3333-4333-8333-333333333333");
    final DeliveryCommandMessage command = FleetDispatchFixtures.command(order);
    int riders;

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

    /**
     * 80 scattered riders (some with an old or inaccurate fix, a mock fix, a break, their own farthest pickup or drop) and
     * riders a few metres either side of each ring and of the radius, north, south, east, west and between.
     */
    @Test
    void onFindsTheSameRidersInTheSameOrderWithTheSameGpsCountsAsOff() {
        List<UUID> all = variedRiders();
        List<UUID> north = new ArrayList<>();
        for (double metres : new double[] {4990, 4993, 4996, 4999.9, 5000.1}) {
            north.add(rider(KITCHEN_LAT + metres / METRES_A_DEGREE, KITCHEN_LNG, 5));
        }
        rolledBack(() -> {
            int compared = 0;
            int found = 0;
            Set<Integer> sizes = new java.util.HashSet<>();
            for (String gpsRule : List.of("off", "shadow", "enforce")) {
                FleetDispatcher off = dispatcher("off", gpsRule, true, false);
                FleetDispatcher on = dispatcher("on", gpsRule, true, false);
                for (int radiusM : new int[] {800, 2000, 3500, 5000}) {
                    for (int dropM : new int[] {-1, 3000, 9000}) {
                        for (Set<UUID> exclude : List.of(Set.<UUID>of(), Set.copyOf(all.subList(0, 30)))) {
                            for (boolean offer : new boolean[] {false, true}) {
                                int[] offFailed = offer ? new int[3] : null;
                                int[] onFailed = offer ? new int[3] : null;
                                Double dropLat = dropM < 0 ? null : KITCHEN_LAT + 0.02;
                                List<Candidate> today = off.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, radiusM, dropM, 130, dropLat,
                                    dropM < 0 ? null : KITCHEN_LNG + 0.02, exclude, offFailed);
                                assertThat(on.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, radiusM, dropM, 130, dropLat,
                                    dropM < 0 ? null : KITCHEN_LNG + 0.02, exclude, onFailed)).containsExactlyElementsOf(today);
                                assertThat(onFailed).isEqualTo(offFailed);
                                compared++;
                                found += today.size();
                                sizes.add(today.size());
                            }
                        }
                    }
                }
                List<UUID> at5km = off.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null).stream()
                    .map(Candidate::riderId).toList();
                // Today's box is 0.1 % narrower than the radius: a rider 4,996 m due north is not found. on keeps that.
                assertThat(at5km).contains(north.get(0), north.get(1)).doesNotContain(north.get(2), north.get(3), north.get(4));
                assertThat(on.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null).stream()
                    .map(Candidate::riderId).toList()).containsExactlyElementsOf(at5km);
            }
            assertThat(compared).isEqualTo(144);
            assertThat(found).as("riders found over all the looks").isGreaterThan(1000);
            assertThat(sizes.size()).as("the looks differ").isGreaterThan(10);
            return null;
        });
        assertThat(fleet.db.queryForObject("SELECT to_regclass('fleet_schema." + FleetDispatcher.POSITION_GEOG_INDEX + "') IS NULL",
            Boolean.class)).as("rolled back").isTrue();
    }

    /** Rings 2 km until 100 s, 3.5 km until 200 s, then 5 km; test mode on, one rider not on its list. */
    @Test
    void withRingsAndTestModeEveryModeAsksTheSameRidersInTheSameOrder() {
        List<UUID> four = List.of(rider(KITCHEN_LAT + 0.005, KITCHEN_LNG, 5), rider(KITCHEN_LAT, KITCHEN_LNG + 0.010, 5),
            rider(KITCHEN_LAT - 0.027, KITCHEN_LNG, 5), rider(KITCHEN_LAT + 0.040, KITCHEN_LNG, 5));
        UUID notListed = rider(KITCHEN_LAT + 0.001, KITCHEN_LNG, 5);
        fleet.db.update("DELETE FROM fleet_schema.test_mode_rider WHERE rider_id = ?", notListed);

        List<UUID> off = askedOverTheStage("off");
        assertThat(off).containsExactly(four.get(0), four.get(1), four.get(0), four.get(2), four.get(1), four.get(3));
        assertThat(List.copyOf(lines)).isEmpty();
        assertThat(askedOverTheStage("on")).containsExactlyElementsOf(off);
        assertThat(List.copyOf(lines)).containsExactly("FLEET_POSTGIS_CANDIDATES mode=on index=rider_position_latest_geog ready");
        lines.clear();
        assertThat(askedOverTheStage("shadow")).containsExactlyElementsOf(off);
        assertThat(lines.remove(0)).isEqualTo("FLEET_POSTGIS_CANDIDATES mode=shadow index=rider_position_latest_geog ready");
        // Counts and times only: no rider, no order.
        assertThat(List.copyOf(lines)).isNotEmpty().allSatisfy(line -> assertThat(line).matches(SHADOW_LINE));
    }

    /** The three looks FleetDispatchStatementsDatabaseTest counts (12, 4, 17), with twelve riders in the band. */
    @Test
    void onCostsWhatOffCostsAndShadowOneStatementMoreALookThatRanks() {
        for (int i = 1; i <= 12; i++) {
            rider(KITCHEN_LAT + 0.0005 * i, KITCHEN_LNG, 5);
        }
        assertThat(looks("off")).containsExactly(12, 4, 17);
        assertThat(looks("on")).containsExactly(12, 4, 17);
        assertThat(looks("shadow")).containsExactly(13, 4, 18);
    }

    @Test
    void theIndexAnswersTheStatement() {
        rider(KITCHEN_LAT + 0.005, KITCHEN_LNG, 5);
        rolledBack(() -> {
            dispatcher("on", "off", false, false);
            db.execute("SET LOCAL enable_seqscan = off");
            assertThat(String.join("\n", db.queryForList("EXPLAIN SELECT p.rider_id FROM fleet_schema.rider_position_latest p WHERE "
                + FleetDispatcher.WITHIN_GEOG, String.class, KITCHEN_LNG, KITCHEN_LAT, 5051.0))).contains(FleetDispatcher.POSITION_GEOG_INDEX);
            return null;
        });
    }

    /** No PostGIS and no right to create it, as on a server where it is not allow-listed: start-up carries on, as off. */
    @Test
    void withoutPostgisItStartsRunsAsOffAndSaysSoOnce() {
        variedRiders();
        rolledBack(() -> {
            db.execute("DROP EXTENSION postgis CASCADE");
            db.execute("CREATE ROLE craves_test_no_ddl");
            db.execute("SET LOCAL ROLE craves_test_no_ddl");
            FleetDispatcher on = dispatcher("on", "off", true, false);
            db.execute("RESET ROLE");
            assertThat(List.copyOf(lines)).hasSize(1).first().asString()
                .startsWith("FLEET_POSTGIS_CANDIDATES mode=on unavailable, running as off: no valid index rider_position_latest_geog; "
                    + "ERROR: permission denied to create extension \"postgis\"");
            assertThat(db.queryForObject("SELECT count(*) FROM pg_extension WHERE extname = 'postgis'", Integer.class)).isZero();
            List<Candidate> today = dispatcher("off", "off", true, false)
                .nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null);
            assertThat(today).hasSizeGreaterThan(10);
            // The statement PostGIS is not in: with the other, this would fail here.
            assertThat(on.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null)).containsExactlyElementsOf(today);
            assertThat(List.copyOf(lines)).hasSize(1);
            return null;
        });
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM pg_extension WHERE extname = 'postgis'", Integer.class)).isOne();
    }

    /** PostGIS goes away under a running service: each look falls back to today's statement inside the same transaction. */
    @Test
    void ifThePostgisStatementFailsTodaysStatementAnswersInTheSameTransaction() {
        variedRiders();
        rolledBack(() -> {
            List<Candidate> today = dispatcher("off", "off", true, false)
                .nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null);
            for (String mode : List.of("on", "shadow")) {
                FleetDispatcher dispatcher = dispatcher(mode, "off", true, false);
                lines.clear();
                db.execute("SAVEPOINT with_postgis");
                db.execute("DROP EXTENSION postgis CASCADE");
                assertThat(dispatcher.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null))
                    .containsExactlyElementsOf(today);
                assertThat(List.copyOf(lines)).containsExactly("FLEET_POSTGIS_CANDIDATES_FAILED mode=" + mode + " error=BadSqlGrammarException");
                db.execute("ROLLBACK TO SAVEPOINT with_postgis");
            }
            return null;
        });
    }

    @Test
    void anyOtherValueStopsStartUp() {
        FleetDispatcher dispatcher = dispatcher("off", "off", false, false);
        dispatcher.setPostgisCandidates(" ");
        dispatcher.setPostgisCandidates(null);
        assertThatThrownBy(() -> dispatcher.setPostgisCandidates("enforce")).isInstanceOf(IllegalStateException.class)
            .hasMessage("craves.fleet.postgis-candidates must be off, shadow or on");
        assertThat(List.copyOf(lines)).isEmpty();
    }

    private List<UUID> variedRiders() {
        Random random = new Random(32);
        List<UUID> all = new ArrayList<>();
        for (int i = 0; i < 80; i++) {
            UUID rider = FleetDispatchFixtures.riderOnShift(fleet, phone(), KITCHEN_LAT + (random.nextDouble() - 0.5) * 0.11,
                KITCHEN_LNG + (random.nextDouble() - 0.5) * 0.11, i % 9 == 0 ? 120 : i % 17 == 0 ? 200 : 5, i % 11 == 0);
            if (i % 7 == 0) {
                fleet.db.update("UPDATE fleet_schema.rider_position_latest SET accuracy_m = 300 WHERE rider_id = ?", rider);
            }
            if (i % 5 == 0) {
                fleet.db.update("UPDATE fleet_schema.rider SET max_pickup_m = ? WHERE id = ?", 500 + 400 * (i % 12), rider);
            }
            if (i % 6 == 0) {
                fleet.db.update("UPDATE fleet_schema.rider SET max_drop_m = ? WHERE id = ?", 1000 + 700 * (i % 10), rider);
            }
            if (i % 13 == 0) {
                FleetDispatchFixtures.onBreak(fleet.db, rider, 5, 20);
            }
            all.add(rider);
        }
        double east = METRES_A_DEGREE * Math.cos(Math.toRadians(KITCHEN_LAT));
        for (int edge : new int[] {2000, 3500, 5000}) {
            for (double metres : new double[] {edge - 8, edge - 0.5, edge + 0.5}) {
                all.add(rider(KITCHEN_LAT - metres / METRES_A_DEGREE, KITCHEN_LNG, 5));
                all.add(rider(KITCHEN_LAT, KITCHEN_LNG + metres / east, 5));
                all.add(rider(KITCHEN_LAT, KITCHEN_LNG - metres / east, 120));
                all.add(rider(KITCHEN_LAT + metres / METRES_A_DEGREE / Math.sqrt(2), KITCHEN_LNG + metres / east / Math.sqrt(2), 5));
            }
        }
        return all;
    }

    private UUID rider(double lat, double lng, int secondsAgo) {
        return FleetDispatchFixtures.riderOnShift(fleet, phone(), lat, lng, secondsAgo, false);
    }

    private String phone() {
        return "+91980000%04d".formatted(++riders);
    }

    private FleetDispatcher dispatcher(String postgisCandidates, String gpsRule, boolean riderChoices, boolean testMode) {
        FleetDispatcher dispatcher = new FleetDispatcher(db, transactions, new FleetPolicyStore(db, json),
            new FleetTestMode(db, FleetDatabase.properties(testMode)), roads, mock(RiderPushClient.class), json, false, riderChoices);
        dispatcher.setGpsRule(gpsRule);
        dispatcher.setPostgisCandidates(postgisCandidates);
        return dispatcher;
    }

    /** The riders asked, in order, over six looks as the stage ages through both rings, each offer declined. */
    private List<UUID> askedOverTheStage(String postgisCandidates) {
        return rolledBack(() -> {
            FleetDispatchFixtures.policyWithRings(db, 20, 300, 0, 2000, 100, 3500, 200);
            FleetDispatchFixtures.kitchen(db, order, true);
            FleetDispatcher dispatcher = dispatcher(postgisCandidates, "off", false, true);
            look(dispatcher);
            for (int age : List.of(30, 60, 100, 130, 200)) {
                declinedAndTheStageIs(age);
                look(dispatcher);
            }
            return db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer ORDER BY round", UUID.class);
        });
    }

    private int[] looks(String postgisCandidates) {
        return rolledBack(() -> {
            FleetDispatchFixtures.policy(db, "live", 20, 300, 1, 0, 1500);
            FleetDispatchFixtures.kitchen(db, order, false);
            FleetDispatcher dispatcher = dispatcher(postgisCandidates, "off", false, false);
            int opening = look(dispatcher);
            int waiting = look(dispatcher);
            db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now()");
            int nextRound = look(dispatcher);
            assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer", Integer.class)).isEqualTo(2);
            return new int[] {opening, waiting, nextRound};
        });
    }

    private int look(FleetDispatcher dispatcher) {
        statements.set(0);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        return statements.get();
    }

    /** As FleetSearchRingsDatabaseTest: the open offer declined, 30 s on for every offer, the stage this old. */
    private void declinedAndTheStageIs(int ageSeconds) {
        db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE state = 'ACTIVE'");
        db.update("UPDATE fleet_schema.trip_offer SET offered_at = offered_at - INTERVAL '30 seconds', "
            + "expires_at = expires_at - INTERVAL '30 seconds', decided_at = decided_at - INTERVAL '30 seconds'");
        db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - make_interval(secs => ?) WHERE provider = 'CRAVES_FLEET'",
            ageSeconds);
    }

    private <T> T rolledBack(Supplier<T> work) {
        return new TransactionTemplate(transactions).execute(status -> {
            status.setRollbackOnly();
            return work.get();
        });
    }
}
