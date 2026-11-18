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
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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
 * counts; without PostGIS, or without the lock to build the index, it runs as off. The index is built as at start-up,
 * CONCURRENTLY on a connection of its own, so it is committed (FleetDatabase drops the schema for the next test); looks
 * run in a transaction that is rolled back.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPostgisCandidatesDatabaseTest {
    /** Great-circle metres a degree of latitude, as RoadDistanceClient.straightLineMetres counts them. */
    static final double METRES_A_DEGREE = Math.toRadians(1) * 6_371_000;
    static final String SHADOW_LINE = "FLEET_POSTGIS_CANDIDATES mode=shadow today=\\d+ postgis=\\d+ missing=0 extra=0 sameOrder=true "
        + "todayFirst=(true|false) todayMicros=\\d+ postgisMicros=\\d+";
    static final String ON_READY = "FLEET_POSTGIS_CANDIDATES mode=on index=rider_position_latest_geog ready";
    static final String ON_LOST = "FLEET_POSTGIS_CANDIDATES mode=on unavailable, running as off: no valid index "
        + "rider_position_latest_geog; another start-up is building it";

    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final AtomicInteger statements = new AtomicInteger();
    final List<String> statementText = new CopyOnWriteArrayList<>();
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
                        statementText.add(args != null && args.length > 0 && args[0] instanceof String text ? text : method.getName());
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
        java.util.Map<String, FleetDispatcher[]> byGpsRule = new java.util.LinkedHashMap<>();
        for (String gpsRule : List.of("off", "shadow", "enforce")) {
            byGpsRule.put(gpsRule, new FleetDispatcher[] {dispatcher("off", gpsRule, true, false), dispatcher("on", gpsRule, true, false)});
        }
        assertThat(List.copyOf(lines)).as("on, really").hasSize(3)
            .allMatch("FLEET_POSTGIS_CANDIDATES mode=on index=rider_position_latest_geog ready"::equals);
        rolledBack(() -> {
            int compared = 0;
            int found = 0;
            Set<Integer> sizes = new java.util.HashSet<>();
            for (FleetDispatcher[] pair : byGpsRule.values()) {
                FleetDispatcher off = pair[0];
                FleetDispatcher on = pair[1];
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
        assertThat(indexValid()).as("built at the first start with on, committed, valid").isTrue();
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
        // Which statement runs first alternates, so neither time always has the pages the other already read.
        assertThat(List.copyOf(lines)).anyMatch(line -> line.contains("todayFirst=true")).anyMatch(line -> line.contains("todayFirst=false"));
    }

    /** The three looks FleetDispatchStatementsDatabaseTest counts (12, 4, 17), with twelve riders in the band. */
    @Test
    void onCostsWhatOffCostsAndShadowOneStatementMoreALookThatRanks() {
        for (int i = 1; i <= 12; i++) {
            rider(KITCHEN_LAT + 0.0005 * i, KITCHEN_LNG, 5);
        }
        assertThat(looks("off")).containsExactly(12, 4, 17);
        List<String> off = List.copyOf(statementText);
        assertThat(off).noneMatch(text -> text.contains("ST_"));
        assertThat(looks("on")).containsExactly(12, 4, 17);
        // The same statements in the same order; the candidate statement of each look that ranks (2) with one more condition.
        List<String> on = List.copyOf(statementText);
        assertThat(on).hasSameSizeAs(off);
        int widened = 0;
        for (int i = 0; i < off.size(); i++) {
            if (!on.get(i).equals(off.get(i))) {
                assertThat(on.get(i)).isEqualTo(off.get(i) + "\n  AND " + FleetDispatcher.WITHIN_GEOG);
                widened++;
            }
        }
        assertThat(widened).isEqualTo(2);
        assertThat(looks("shadow")).containsExactly(13, 4, 18);
    }

    @Test
    void theIndexAnswersTheStatement() {
        rider(KITCHEN_LAT + 0.005, KITCHEN_LNG, 5);
        dispatcher("on", "off", false, false);
        rolledBack(() -> {
            db.execute("SET LOCAL enable_seqscan = off");
            assertThat(String.join("\n", db.queryForList("EXPLAIN SELECT p.rider_id FROM fleet_schema.rider_position_latest p WHERE "
                + FleetDispatcher.WITHIN_GEOG, String.class, KITCHEN_LNG, KITCHEN_LAT, 5051.0))).contains(FleetDispatcher.POSITION_GEOG_INDEX);
            return null;
        });
    }

    /**
     * No PostGIS and no right to create it, as on a server where it is not allow-listed: start-up carries on, as off. The
     * service's role owns the tables (a member of the owner) but is not a superuser. In a database of its own, made from
     * template0 (no PostGIS) and dropped after, so the shared test database keeps PostGIS whatever happens here.
     */
    @Test
    void withoutPostgisItStartsRunsAsOffAndSaysSoOnce() {
        String database = "craves_postgis_absent_test";
        String owner = fleet.db.queryForObject("SELECT current_user", String.class);
        fleet.db.execute("DROP DATABASE IF EXISTS " + database + " WITH (FORCE)");
        fleet.db.execute("CREATE DATABASE " + database + " TEMPLATE template0");
        fleet.db.execute("DROP ROLE IF EXISTS craves_test_no_ddl");
        fleet.db.execute("CREATE ROLE craves_test_no_ddl");
        fleet.db.execute("GRANT \"" + owner + "\" TO craves_test_no_ddl");
        try {
            FleetDatabase bare = new FleetDatabase(database);
            Random random = new Random(32);
            for (int i = 0; i < 20; i++) {
                FleetDispatchFixtures.riderOnShift(bare, phone(), KITCHEN_LAT + (random.nextDouble() - 0.5) * 0.08,
                    KITCHEN_LNG + (random.nextDouble() - 0.5) * 0.08, 5, false);
            }
            List<Candidate> today = dispatcher(bare.db, "off", "off", true, false)
                .nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null);
            assertThat(today).hasSizeGreaterThan(5);
            JdbcTemplate service = new JdbcTemplate(new DelegatingDataSource(bare.dataSource) {
                @Override
                public Connection getConnection() throws SQLException {
                    Connection connection = super.getConnection();
                    try (var statement = connection.createStatement()) {
                        statement.execute("SET ROLE craves_test_no_ddl");
                    }
                    return connection;
                }
            });
            FleetDispatcher on = dispatcher(service, "on", "off", true, false);
            assertThat(List.copyOf(lines)).hasSize(1).first().asString()
                .startsWith("FLEET_POSTGIS_CANDIDATES mode=on unavailable, running as off: no valid index rider_position_latest_geog; "
                    + "ERROR: permission denied to create extension \"postgis\"");
            assertThat(bare.db.queryForObject("SELECT count(*) FROM pg_extension WHERE extname = 'postgis'", Integer.class)).isZero();
            assertThat(bare.db.queryForObject("SELECT to_regclass('fleet_schema." + FleetDispatcher.POSITION_GEOG_INDEX + "') IS NULL",
                Boolean.class)).isTrue();
            // The statement PostGIS is not in: with the other, this would fail here.
            assertThat(on.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null)).containsExactlyElementsOf(today);
            assertThat(List.copyOf(lines)).hasSize(1);
        } finally {
            fleet.db.execute("DROP DATABASE IF EXISTS " + database + " WITH (FORCE)");
            fleet.db.execute("DROP ROLE craves_test_no_ddl");
        }
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM pg_extension WHERE extname = 'postgis'", Integer.class)).isOne();
    }

    /**
     * A transaction holds a position write: the build waits for it 5 s and gives up, so the service starts as off. While
     * it waits, other riders' positions are written (a plain CREATE INDEX would hold them). The next start drops the
     * invalid index the failed build left and builds it.
     */
    @Test
    void aBuildThatCannotHaveItsLockGivesUpAsOffWithoutHoldingWritesAndTheNextStartBuildsIt() throws Exception {
        UUID held = rider(KITCHEN_LAT + 0.005, KITCHEN_LNG, 5);
        UUID other = rider(KITCHEN_LAT + 0.006, KITCHEN_LNG, 5);
        String waiting = "SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'CREATE INDEX CONCURRENTLY%' AND wait_event_type = 'Lock'";
        FleetDispatcher started;
        try (Connection writer = fleet.dataSource.getConnection(); var write = writer.createStatement()) {
            writer.setAutoCommit(false);
            assertThat(write.executeUpdate("UPDATE fleet_schema.rider_position_latest SET recorded_at = now() WHERE rider_id = '"
                + held + "'")).isOne();
            long begun = System.nanoTime();
            CompletableFuture<FleetDispatcher> starting = CompletableFuture.supplyAsync(() -> dispatcher("on", "off", false, false));
            while (fleet.db.queryForObject(waiting, Integer.class) == 0) {
                assertThat(starting).as("the build waits for the lock").isNotDone();
                Thread.sleep(20);
            }
            try (Connection ingest = fleet.dataSource.getConnection(); var position = ingest.createStatement()) {
                position.execute("SET statement_timeout = '1s'");
                assertThat(position.executeUpdate("UPDATE fleet_schema.rider_position_latest SET recorded_at = now() WHERE rider_id = '"
                    + other + "'")).isOne();
            }
            assertThat(fleet.db.queryForObject(waiting, Integer.class)).as("written while the build waited").isOne();
            started = starting.get(90, TimeUnit.SECONDS);
            // At least the 5 s lock timeout, and well under the 60 s statement timeout (the line says which one ended it).
            assertThat(Duration.ofNanos(System.nanoTime() - begun)).isBetween(Duration.ofMillis(4900), Duration.ofSeconds(55));
            writer.rollback();
        }
        assertThat(List.copyOf(lines)).hasSize(1).first().asString().isEqualTo("FLEET_POSTGIS_CANDIDATES mode=on unavailable, running "
            + "as off: no valid index rider_position_latest_geog; ERROR: canceling statement due to lock timeout");
        assertThat(indexValid()).as("left by the failed build").isFalse();
        assertThat(started.nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null)).hasSize(2);
        assertThat(List.copyOf(lines)).as("off: no shadow line").hasSize(1);
        // A start-up while another holds the build lock does no DDL: it neither drops nor builds, and runs as off.
        long invalid = indexOid();
        try (Connection replica = fleet.dataSource.getConnection(); var building = replica.createStatement();
             var locked = building.executeQuery("SELECT pg_try_advisory_lock(" + FleetDispatcher.POSITION_GEOG_LOCK + ")")) {
            assertThat(locked.next() && locked.getBoolean(1)).isTrue();
            lines.clear();
            dispatcher("on", "off", false, false);
            assertThat(List.copyOf(lines)).containsExactly(ON_LOST);
            assertThat(indexOid()).isEqualTo(invalid);
            assertThat(indexValid()).isFalse();
        }
        lines.clear();
        dispatcher("shadow", "off", false, false);
        assertThat(List.copyOf(lines)).containsExactly("FLEET_POSTGIS_CANDIDATES mode=shadow index=rider_position_latest_geog ready");
        assertThat(indexValid()).isTrue();
        lines.clear();
        dispatcher("on", "off", false, false);
        assertThat(List.copyOf(lines)).containsExactly("FLEET_POSTGIS_CANDIDATES mode=on index=rider_position_latest_geog ready");
    }

    /**
     * A build somebody else is running (the owner by hand: no build lock) is never dropped. It waits on a held position
     * write; the start-up sees it in pg_stat_progress_create_index, leaves it, cannot build its own and runs as off.
     */
    @Test
    void aBuildInProgressIsNotDroppedAndTheStartRunsAsOff() throws Exception {
        UUID held = rider(KITCHEN_LAT + 0.005, KITCHEN_LNG, 5);
        String waiting = "SELECT count(*) FROM pg_stat_activity WHERE query LIKE 'CREATE INDEX CONCURRENTLY%' AND wait_event_type = 'Lock'";
        try (Connection writer = fleet.dataSource.getConnection(); var write = writer.createStatement();
             Connection owner = fleet.dataSource.getConnection(); var byHand = owner.createStatement()) {
            writer.setAutoCommit(false);
            write.executeUpdate("UPDATE fleet_schema.rider_position_latest SET recorded_at = now() WHERE rider_id = '" + held + "'");
            CompletableFuture<Boolean> build = CompletableFuture.supplyAsync(() -> {
                try {
                    return byHand.execute("CREATE INDEX CONCURRENTLY " + FleetDispatcher.POSITION_GEOG_INDEX + " ON fleet_schema."
                        + "rider_position_latest USING gist ((public.ST_SetSRID(public.ST_MakePoint(lng, lat), 4326)::public.geography))");
                } catch (SQLException failed) {
                    throw new IllegalStateException(failed);
                }
            });
            while (fleet.db.queryForObject(waiting, Integer.class) == 0) {
                assertThat(build).isNotDone();
                Thread.sleep(20);
            }
            long building = indexOid();
            dispatcher("on", "off", false, false);
            assertThat(List.copyOf(lines)).hasSize(1).first().asString()
                .startsWith("FLEET_POSTGIS_CANDIDATES mode=on unavailable, running as off: no valid index rider_position_latest_geog; ERROR: ");
            assertThat(indexOid()).as("not dropped").isEqualTo(building);
            assertThat(build).isNotDone();
            writer.rollback();
            build.get(60, TimeUnit.SECONDS);
        }
        assertThat(indexValid()).isTrue();
        lines.clear();
        dispatcher("on", "off", false, false);
        assertThat(List.copyOf(lines)).containsExactly(ON_READY);
    }

    /** Replicas starting together: one builds; each other one finds it built or runs as off; one valid index after. */
    @Test
    void startUpsTogetherBuildOneIndexAndDropNothing() {
        variedRiders();
        CountDownLatch go = new CountDownLatch(1);
        List<CompletableFuture<FleetDispatcher>> starts = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            starts.add(CompletableFuture.supplyAsync(() -> {
                try {
                    go.await();
                } catch (InterruptedException interrupted) {
                    throw new IllegalStateException(interrupted);
                }
                return dispatcher("on", "off", false, false);
            }));
        }
        go.countDown();
        starts.forEach(CompletableFuture::join);
        assertThat(List.copyOf(lines)).hasSize(4).contains(ON_READY).allMatch(line -> line.equals(ON_READY) || line.equals(ON_LOST));
        assertThat(indexValid()).isTrue();
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname = 'fleet_schema' AND tablename = "
            + "'rider_position_latest' AND indexname LIKE 'rider_position_latest_geog%'", Integer.class)).isOne();
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory'", Integer.class))
            .as("every start-up let the build lock go").isZero();
    }

    /** PostGIS goes away under a running service: each look falls back to today's statement inside the same transaction. */
    @Test
    void ifThePostgisStatementFailsTodaysStatementAnswersInTheSameTransaction() {
        variedRiders();
        FleetDispatcher on = dispatcher("on", "off", true, false);
        FleetDispatcher shadow = dispatcher("shadow", "off", true, false);
        assertThat(List.copyOf(lines)).as("both really started").containsExactly(
            "FLEET_POSTGIS_CANDIDATES mode=on index=rider_position_latest_geog ready",
            "FLEET_POSTGIS_CANDIDATES mode=shadow index=rider_position_latest_geog ready");
        rolledBack(() -> {
            List<Candidate> today = dispatcher("off", "off", true, false)
                .nearbyRiders(KITCHEN_LAT, KITCHEN_LNG, 5000, -1, 130, null, null, Set.of(), null);
            for (String mode : List.of("on", "shadow")) {
                FleetDispatcher dispatcher = "on".equals(mode) ? on : shadow;
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
        return dispatcher(db, postgisCandidates, gpsRule, riderChoices, testMode);
    }

    private FleetDispatcher dispatcher(JdbcTemplate db, String postgisCandidates, String gpsRule, boolean riderChoices, boolean testMode) {
        FleetDispatcher dispatcher = new FleetDispatcher(db, new DataSourceTransactionManager(db.getDataSource()), new FleetPolicyStore(db, json),
            new FleetTestMode(db, FleetDatabase.properties(testMode)), roads, mock(RiderPushClient.class), json, false, riderChoices);
        dispatcher.setGpsRule(gpsRule);
        dispatcher.setPostgisCandidates(postgisCandidates);
        return dispatcher;
    }

    /** The riders asked, in order, over six looks as the stage ages through both rings, each offer declined. */
    private List<UUID> askedOverTheStage(String postgisCandidates) {
        FleetDispatcher dispatcher = dispatcher(postgisCandidates, "off", false, true);
        return rolledBack(() -> {
            FleetDispatchFixtures.policyWithRings(db, 20, 300, 0, 2000, 100, 3500, 200);
            FleetDispatchFixtures.kitchen(db, order, true);
            look(dispatcher);
            for (int age : List.of(30, 60, 100, 130, 200)) {
                declinedAndTheStageIs(age);
                look(dispatcher);
            }
            return db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer ORDER BY round", UUID.class);
        });
    }

    /** The statements' text is left in statementText, in order. */
    private int[] looks(String postgisCandidates) {
        FleetDispatcher dispatcher = dispatcher(postgisCandidates, "off", false, false);
        statementText.clear();
        return rolledBack(() -> {
            FleetDispatchFixtures.policy(db, "live", 20, 300, 1, 0, 1500);
            FleetDispatchFixtures.kitchen(db, order, false);
            int opening = look(dispatcher);
            int waiting = look(dispatcher);
            db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now()");
            int nextRound = look(dispatcher);
            assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer", Integer.class)).isEqualTo(2);
            return new int[] {opening, waiting, nextRound};
        });
    }

    private int look(FleetDispatcher dispatcher) {
        int before = statementText.size();
        statements.set(0);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        assertThat(statementText.size() - before).isEqualTo(statements.get());
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

    /** As FleetDispatcher reads it: true valid, false there but not valid, null not there. */
    private Boolean indexValid() {
        return fleet.db.query("SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.oid = "
            + "to_regclass('fleet_schema." + FleetDispatcher.POSITION_GEOG_INDEX + "')", rows -> rows.next() ? rows.getBoolean(1) : null);
    }

    private long indexOid() {
        return fleet.db.queryForObject("SELECT to_regclass('fleet_schema." + FleetDispatcher.POSITION_GEOG_INDEX + "')::oid", Long.class);
    }

    private <T> T rolledBack(Supplier<T> work) {
        return new TransactionTemplate(transactions).execute(status -> {
            status.setRollbackOnly();
            return work.get();
        });
    }
}
