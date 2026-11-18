package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.zaxxer.hikari.HikariDataSource;
import in.craves.integration.LoggedEvents;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryCommandWake;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.command.DeliveryServiceBusPublisher;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetDispatcher.Look;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.BiConsumer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/**
 * CRAVES_FLEET_TIMERS on PostgreSQL with every migration: a look without the order's command (FleetDispatcher.matchOrClose)
 * offers as the command's look does, two of them at once send one round (1,000 times), 300 due orders each ring a rider
 * from one look, and what the timers, the free-rider wake and CRAVES_FLEET_STAGE_LEAVES_COMMAND_ENABLED do. The queue is
 * a list here; times are moved in the rows, so nothing waits.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetTimersDatabaseTest {
    static FleetDatabase fleet;
    /** Pooled connections for the code under test: FleetDatabase's own data source opens one for every statement. */
    static HikariDataSource pool;
    static JdbcTemplate pooled;
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
    final DeliveryCommandRepository commands = new DeliveryCommandRepository(fleet.db, json);
    /** The fleet-timers messages sent: "<trip>|<seconds from now, rounded>". */
    final List<String> sent = new CopyOnWriteArrayList<>();
    final BiConsumer<UUID, Instant> queue = (trip, at) -> sent.add(trip + "|" + Math.round(Duration.between(Instant.now(), at).toMillis() / 1000.0));
    final LoggedEvents logged = new LoggedEvents();

    @BeforeAll
    static void migrate() {
        fleet = new FleetDatabase();
        pool = new HikariDataSource();
        pool.setJdbcUrl(System.getenv("LEDGER_TEST_JDBC_URL"));
        pool.setUsername(System.getenv("LEDGER_TEST_DB_USER"));
        pool.setPassword(System.getenv("LEDGER_TEST_DB_PASSWORD"));
        pool.setMaximumPoolSize(20);
        pooled = new JdbcTemplate(pool);
        // The owner's rule: one rider at a time, 20 s each, for 300 s, no limit on rounds; nearest first.
        FleetDispatchFixtures.policy(fleet.db, "live", 20, 300, 1, 0, 0);
    }

    @AfterAll
    static void close() {
        pool.close();
    }

    @BeforeEach
    void setUp() {
        fleet.db.execute("TRUNCATE fleet_schema.rider, fleet_schema.trip, delivery_schema.delivery_command CASCADE");
        logged.start();
        ((Logger) LoggerFactory.getLogger(FleetTimers.class)).addAppender(logged);
        ((Logger) LoggerFactory.getLogger(FleetStageSweeper.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(FleetTimers.class)).detachAppender(logged);
        ((Logger) LoggerFactory.getLogger(FleetStageSweeper.class)).detachAppender(logged);
    }

    @Test
    void offDoesNothingAndAnUnknownModeStopsStartUp() {
        FleetDispatcher dispatcher = dispatcher();
        FleetTimers off = timers(dispatcher, " ", false, "on", queue);
        UUID order = order(dispatcher);
        threeRiders();
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        String before = stageRow();

        assertThat(deciding(dispatcher, order)).as("the command's own next check").isCloseTo(5, within(1.0));
        off.afterTrip(trip);
        off.afterBreak(UUID.randomUUID());

        assertThat(off.on()).isFalse();
        assertThat(sent).isEmpty();
        assertThat(stageRow()).as("no next look stored, nothing claimed").isEqualTo(before);
        assertThat(logged.list).isEmpty();
        assertThatThrownBy(() -> timers(dispatcher, "enforce", false, "off", queue)).isInstanceOf(IllegalStateException.class);
    }

    /**
     * One order under the owner's rule: asked, deciding, declined, run out, everyone asked, asked again, no time left,
     * deadline. Looked at by its command each time, or (after the look that opens it) only by timers: the offers and the
     * stage's end are the same. At the deadline the timer's look does not close the stage: it makes the command due, and
     * the command closes it.
     */
    @Test
    void timerLooksOfferTheSameRidersInTheSameOrderAsTheCommandsLooks() {
        List<String> byCommand = story(false);
        verifyNoInteractions(publisher);
        fleet.db.execute("TRUNCATE fleet_schema.rider, fleet_schema.trip, delivery_schema.delivery_command CASCADE");

        List<String> byTimers = story(true);

        assertThat(byTimers).isEqualTo(byCommand);
        assertThat(byCommand).containsExactly("round 1 rider 1 for 20 s DECLINED", "round 2 rider 2 for 20 s EXPIRED",
            "round 3 rider 3 for 20 s DECLINED", "round 4 rider 1 for 20 s EXPIRED", "stage CLOSED:NO_ACCEPT", "trip BORZO");
        verify(publisher, times(1)).publishNow(any(), startsWith("fleet-timer:"));
        assertThat(sent).as("every look that left riders deciding sent its next check").hasSize(7)
            .allMatch(message -> message.endsWith("|5") || message.endsWith("|2"));
    }

    private List<String> story(boolean byTimers) {
        FleetDispatcher dispatcher = dispatcher();
        FleetTimers timers = timers(dispatcher, byTimers ? "on" : "off", false, "off", queue);
        List<UUID> riders = threeRiders();
        UUID order = UUID.randomUUID();
        FleetDispatchFixtures.kitchen(fleet.db, order, false);
        DeliveryCommandMessage command = FleetDispatchFixtures.command(order);
        UUID commandId = commands.createOrFind(command).id();
        fleet.db.update("UPDATE delivery_schema.delivery_command SET status = 'WAITING_FOR_PROVIDER', provider_wait_started_at = now(), "
            + "next_provider_retry_at = now() + INTERVAL '5 minutes' WHERE id = ?", commandId);
        Runnable commandLook = () -> {
            try {
                dispatcher.run(command, OptionalLong::empty, true);
            } catch (DeliveryProviderTemporarilyUnavailableException deciding) {
                // riders are deciding
            }
        };
        commandLook.run(); // opens: the nearest rider is asked
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        Runnable look = !byTimers ? commandLook : () -> {
            fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() WHERE state = 'OPEN'"); // its time has come
            timers.onMessage(trip + "|" + System.currentTimeMillis());
        };
        look.run(); // deciding
        declined();
        look.run(); // the second rider
        ranOut(21);
        look.run(); // the third
        declined();
        look.run(); // everyone was asked in the last 25 s: nobody yet
        ranOut(30);
        look.run(); // the nearest again
        ranOut(21);
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '298 seconds', deadline_at = now() + INTERVAL '2 seconds'");
        look.run(); // no time left for an offer: the next check is the deadline
        fleet.db.update("UPDATE fleet_schema.trip_stage SET deadline_at = now() - INTERVAL '1 second' WHERE state = 'OPEN'");
        look.run(); // the deadline
        if (byTimers) {
            assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_stage WHERE provider = 'CRAVES_FLEET'", String.class))
                .as("a look without the command never closes a stage").isEqualTo("OPEN");
            assertThat(commands.claim(commandId, 5)).as("the command was made due").isPresent();
            commandLook.run();
        }
        List<String> story = new ArrayList<>(fleet.db.query("SELECT round, rider_id, EXTRACT(EPOCH FROM expires_at - offered_at)::int AS seconds, "
            + "state FROM fleet_schema.trip_offer ORDER BY round", (row, n) -> "round " + row.getInt("round") + " rider "
            + (riders.indexOf(row.getObject("rider_id", UUID.class)) + 1) + " for " + row.getInt("seconds") + " s " + row.getString("state")));
        story.add("stage " + fleet.db.queryForObject("SELECT state || ':' || outcome FROM fleet_schema.trip_stage WHERE provider = 'CRAVES_FLEET'",
            String.class));
        story.add("trip " + fleet.db.queryForObject("SELECT provider FROM fleet_schema.trip", String.class));
        return story;
    }

    @Test
    void aTimerStartsALookOnlyWhileTheStageIsDueAndShadowOnlyLogs() {
        FleetDispatcher dispatcher = dispatcher();
        FleetTimers shadow = timers(dispatcher, "shadow", false, "off", queue);
        UUID order = order(dispatcher);
        threeRiders();
        deciding(dispatcher, order); // the stage opened with nobody near: this look asks the nearest rider
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        assertThat(sent).as("shadow sends each look's next check").containsExactly(trip + "|5", trip + "|5");
        declined();

        // Shadow: the command has not looked yet when the timer comes (due), then it has (not due). Nothing is offered.
        fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now()");
        shadow.onTimer(trip, Instant.now().minusMillis(40));
        fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() + INTERVAL '5 seconds'");
        shadow.onTimer(trip, Instant.now());
        assertThat(logged.lines("FLEET_TIMER ")).hasSize(2).allMatch(line -> line.contains("mode=shadow trip=" + trip));
        assertThat(logged.lines("FLEET_TIMER ").get(0)).contains("due=true");
        assertThat(logged.lines("FLEET_TIMER ").get(1)).contains("due=false");
        assertThat(offers()).isEqualTo(1);
        assertThat(shadow.riderFree("(SELECT rider_id FROM fleet_schema.trip_offer WHERE trip_id = ? LIMIT 1)", trip)).isOne();
        assertThat(offers()).as("shadow counts the orders a free rider would wake, and wakes none").isEqualTo(1);
        assertThat(logged.lines("FLEET_RIDER_FREE ")).containsExactly("FLEET_RIDER_FREE mode=shadow stages=1");

        // On: a timer for a stage a look already moved on is dropped; one that is due looks once, and sends the next.
        sent.clear();
        FleetTimers on = timers(dispatcher, "on", false, "off", queue);
        on.onTimer(trip, Instant.now());
        assertThat(offers()).as("not due: another look came first").isEqualTo(1);
        fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() + INTERVAL '900 milliseconds'");
        on.onTimer(trip, Instant.now());
        on.onTimer(trip, Instant.now());
        assertThat(offers()).as("the second rider, once").isEqualTo(2);
        assertThat(sent).containsExactly(trip + "|5");
        on.onMessage("not a timer");
        on.onTimer(UUID.randomUUID(), Instant.now());
        assertThat(logged.lines("FLEET_TIMER_FAILED")).hasSize(1);

        // A cancelled order is offered to nobody; a stage that is closed or a courier's is left alone.
        declined();
        fleet.orderCancelled(order);
        assertThat(dispatcher.matchOrClose(trip).outcome()).isEqualTo(Look.GONE);
        assertThat(offers()).isEqualTo(2);
        verifyNoInteractions(publisher);
    }

    @Test
    void theCommandComesBackAtTheDeadlineOnlyOnceTheTimerIsSentWithTimersAndTheSweeperOn() {
        threeRiders();
        // Asked for without the sweeper: ignored.
        FleetDispatcher noSweeper = dispatcher();
        timers(noSweeper, "on", true, "shadow", queue);
        assertThat(deciding(noSweeper, order(noSweeper))).isCloseTo(5, within(1.0));
        assertThat(logged.lines("FLEET_STAGE_LEAVES_COMMAND ignored")).hasSize(1);

        FleetDispatcher dispatcher = dispatcher();
        timers(dispatcher, "on", true, "on", queue);
        sent.clear();
        UUID order = order(dispatcher);
        assertThat(sent).hasSize(1).allMatch(message -> message.endsWith("|5"));
        assertThat(fleet.db.queryForObject("SELECT EXTRACT(EPOCH FROM s.next_match_at - now()) FROM fleet_schema.trip_stage s "
            + "JOIN fleet_schema.trip t ON t.id = s.trip_id WHERE t.chef_sub_order_id = ?", Double.class, order))
            .as("the stage's next look is still the next check").isCloseTo(5, within(1.0));
        assertThat(deciding(dispatcher, order)).as("the command is told the stage's deadline").isCloseTo(300, within(2.0));

        // The queue is not there: the command keeps its own checks, and the sends stop for a minute.
        List<UUID> tried = new ArrayList<>();
        FleetDispatcher noQueue = dispatcher();
        timers(noQueue, "on", true, "on", (trip, at) -> {
            tried.add(trip);
            throw new IllegalStateException("The messaging entity could not be found");
        });
        UUID second = order(noQueue);
        assertThat(deciding(noQueue, second)).isCloseTo(5, within(1.0));
        assertThat(tried).as("one failed send, then none for a minute").hasSize(1);
        assertThat(logged.lines("CRAVES_ALERT alert=FLEET_TIMERS_SEND_FAILED")).hasSize(1);
    }

    @Test
    void aRiderWhoBecameFreeWakesTheOrdersWaitingNearThemAndNoOther() {
        FleetDispatcher dispatcher = dispatcher();
        FleetTimers timers = timers(dispatcher, "on", false, "off", queue);
        UUID order = order(dispatcher); // nobody in range: the order waits
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        UUID far = FleetDispatchFixtures.riderOnShift(fleet, "+919800000091", KITCHEN_LAT + 0.2, KITCHEN_LNG, 5, false); // ~22 km
        UUID near = FleetDispatchFixtures.riderOnShift(fleet, "+919800000092", KITCHEN_LAT + 0.002, KITCHEN_LNG, 5, false);
        String byRider = "(SELECT CAST(? AS uuid))";

        assertThat(timers.riderFree(byRider, far)).isZero();
        assertThat(offers()).isZero();
        // The rider's trip ended (FleetTripService calls afterTrip with it): found through that trip.
        UUID ended = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'DELIVERED', finished_at = now() WHERE id = ?", near, ended);
        assertThat(timers.riderFree("(SELECT rider_id FROM fleet_schema.trip WHERE id = ?)", ended)).isOne();

        assertThat(fleet.db.queryForList("SELECT rider_id FROM fleet_schema.trip_offer WHERE trip_id = ? AND state = 'ACTIVE'", UUID.class, trip))
            .as("the order's own look chose its rider").containsExactly(near);
        assertThat(timers.riderFree(byRider, near)).as("a stage whose rider is deciding is not woken").isZero();
        assertThat(logged.lines("FLEET_RIDER_FREE ")).containsExactly("FLEET_RIDER_FREE mode=on stages=1");
        assertThat(order).isNotNull();
    }

    @Test
    void theSweeperLooksItselfWithTimersOnAndSendsTheCommandOnlyWhereThatLookCouldNotGoOn() {
        FleetDispatcher dispatcher = dispatcher();
        FleetTimers timers = timers(dispatcher, "on", false, "on", queue);
        FleetStageSweeper sweeper = new FleetStageSweeper(pooled, json, provider(publisher), new DeliveryCommandProperties(), "on", 10);
        sweeper.setTimers(timers);
        UUID order = order(dispatcher);
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        // A pass died holding the command, past its lease; the order's messages are gone; a rider came into range.
        UUID commandId = commands.createOrFind(FleetDispatchFixtures.command(order)).id();
        fleet.db.update("UPDATE delivery_schema.delivery_command SET status = 'PROCESSING', processing_started_at = now() - INTERVAL '11 minutes' "
            + "WHERE id = ?", commandId);
        threeRiders();
        fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() - INTERVAL '20 seconds'");

        assertThat(sweeper.sweep()).isOne();

        assertThat(offers()).as("the overdue stage was looked at without its command").isEqualTo(1);
        verifyNoInteractions(publisher);
        assertThat(logged.lines("CRAVES_ALERT alert=FLEET_SWEEPER_CAUGHT")).singleElement().asString()
            .contains("trip=" + trip, "sent=false looked=true");

        // Past the deadline the look needs the command; this one is not waiting, so it gets the sweeper's message as before.
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '5 minutes', deadline_at = now() - INTERVAL '1 second', "
            + "next_match_at = now() - INTERVAL '20 seconds'");
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now()");
        assertThat(sweeper.sweep()).isOne();
        verify(publisher, times(1)).publishNow(any(), startsWith("fleet-sweep:"));
        verify(publisher, never()).publishNow(any(), startsWith("fleet-timer:"));
    }

    /**
     * R22 6.2, the single writer: two looks at one stage at the same moment, 1,000 times. Each time exactly one rider is
     * asked, by one offer in one new round, and neither look fails: the loser of the stage row's lock finds the round
     * sent and waits, so no unique index is what stops a second offer.
     */
    @Test
    void twoLooksAtOnceSendOneRoundAThousandTimes() throws Exception {
        FleetDispatcher dispatcher = dispatcher();
        timers(dispatcher, "on", false, "off", (trip, at) -> { });
        UUID order = order(dispatcher);
        threeRiders();
        UUID trip = fleet.db.queryForObject("SELECT id FROM fleet_schema.trip", UUID.class);
        CyclicBarrier together = new CyclicBarrier(2);
        Callable<String> look = () -> {
            together.await();
            return dispatcher.matchOrClose(trip).outcome();
        };
        ExecutorService two = Executors.newFixedThreadPool(2);
        try {
            for (int i = 1; i <= 1_000; i++) {
                // The last offer ran out long enough ago for its rider to be asked again; the stage has its whole time left.
                pooled.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now(), offered_at = offered_at - INTERVAL '60 seconds', "
                    + "expires_at = expires_at - INTERVAL '60 seconds' WHERE trip_id = ? AND state = 'ACTIVE'", trip);
                pooled.update("UPDATE fleet_schema.trip_stage SET deadline_at = now() + INTERVAL '5 minutes' WHERE trip_id = ?", trip);
                for (Future<String> done : two.invokeAll(List.of(look, look))) {
                    assertThat(done.get()).as("look %d", i).isEqualTo(Look.WAITING);
                }
                assertThat(pooled.queryForObject("SELECT count(*) FILTER (WHERE state = 'ACTIVE') || ' ringing, ' || count(*) || ' offers, ' || "
                    + "max(round) || ' rounds' FROM fleet_schema.trip_offer WHERE trip_id = ?", String.class, trip))
                    .as("after race %d", i).isEqualTo("1 ringing, " + i + " offers, " + i + " rounds");
            }
        } finally {
            two.shutdownNow();
        }
        assertThat(pooled.queryForObject("SELECT count(*) FROM fleet_schema.trip WHERE rider_id IS NOT NULL", Integer.class)).isZero();
        assertThat(order).isNotNull();
    }

    /**
     * R22's load case for the timers: 300 orders waiting, each with a rider near its own kitchen, all due at once. Their
     * timers are handled as four replicas' consumers would (four looks at once each). Every order rings its rider from
     * that one look, before its next check would have come. The time from due to the offer row is printed
     * (FLEET_TIMERS_LOAD); R22's target for it, a 99th percentile of 2 s, is not asserted here: with the database on the
     * test machine the candidate query's time decides it (measured figures are in the pull request).
     */
    @Test
    void threeHundredDueOrdersEachRingARiderFromTheirFirstLook() throws Exception {
        FleetDispatcher dispatcher = dispatcher();
        FleetTimers timers = timers(dispatcher, "on", false, "off", (trip, at) -> { });
        // Once to warm the code and the connections up, as a running service is; the second run is the measurement.
        List<Double> cold = ringSeconds(timers);
        pooled.execute("TRUNCATE fleet_schema.rider, fleet_schema.trip CASCADE");
        List<Double> seconds = ringSeconds(timers);

        assertThat(seconds).as("every order rang a rider").hasSize(300);
        System.out.printf("FLEET_TIMERS_LOAD orders=300 p50=%.3fs p99=%.3fs max=%.3fs (first run: p99=%.3fs)%n", seconds.get(149),
            seconds.get(296), seconds.get(299), cold.get(296));
        assertThat(seconds.get(296)).as("due to first ring, 99th percentile, seconds: before the next check")
            .isLessThan(FleetDispatcher.ROUND_CHECK_EVERY.toSeconds());
        assertThat(pooled.queryForObject("SELECT count(*) || ' offers, ' || max(round) || ' round' FROM fleet_schema.trip_offer", String.class))
            .isEqualTo("300 offers, 1 round");
        assertThat(pooled.queryForObject("SELECT count(*) FROM (SELECT rider_id FROM fleet_schema.trip_offer WHERE state = 'ACTIVE' "
            + "GROUP BY rider_id HAVING count(*) > 1) twice", Integer.class)).as("no rider rung for two orders at once").isZero();
    }

    /** 300 orders due now, their timers handled 16 at a time: seconds from due to each order's first offer, ascending. */
    private List<Double> ringSeconds(FleetTimers timers) throws Exception {
        // Kitchen n sits on a grid 22 km apart, its one rider 110 m north of it.
        String lat = "(10 + 0.2 * (n / 15))";
        String lng = "(70 + 0.2 * (n % 15))";
        pooled.update("INSERT INTO fleet_schema.rider (id, name, phone, created_by, status, identity_id) SELECT gen_random_uuid(), 'Rider ' || n, "
            + "'+9197' || lpad(n::text, 8, '0'), gen_random_uuid(), 'ACTIVE', gen_random_uuid() FROM generate_series(0, 299) n");
        pooled.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, last_seen_at) "
            + "SELECT gen_random_uuid(), id, md5(phone) || md5(name), now() + INTERVAL '8 hours', now() FROM fleet_schema.rider");
        pooled.update("INSERT INTO fleet_schema.rider_position_latest (rider_id, lat, lng, accuracy_m, mock, recorded_at, received_at) "
            + "SELECT id, " + lat + " + 0.001, " + lng + ", 8, false, now(), now() FROM (SELECT id, substr(phone, 6)::int AS n FROM fleet_schema.rider) r");
        pooled.update("""
            INSERT INTO fleet_schema.trip (id, chef_sub_order_id, order_id, chef_id, order_code, items_count, kitchen_name,
              kitchen_area, kitchen_address, kitchen_lat, kitchen_lng, chef_phone, customer_first_name, customer_phone,
              drop_area, drop_address, drop_lat, drop_lng)
            SELECT gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '#0A1B2C3D', 2, 'Kitchen ' || n, 'Area', 'Road 1',
              %s, %s, '+919000000000', 'Priya', '+919000000001', 'Area', 'Flat 2', %s + 0.02, %s - 0.02
            FROM generate_series(0, 299) n""".formatted(lat, lng, lat, lng));
        Instant due = pooled.queryForObject("SELECT now()", java.sql.Timestamp.class).toInstant();
        pooled.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, opened_at, deadline_at, next_match_at) "
            + "SELECT gen_random_uuid(), id, 1, 'CRAVES_FLEET', now() - INTERVAL '1 minute', now() + INTERVAL '4 minutes', ? FROM fleet_schema.trip",
            java.sql.Timestamp.from(due));
        List<UUID> trips = pooled.queryForList("SELECT id FROM fleet_schema.trip", UUID.class);

        ExecutorService consumers = Executors.newFixedThreadPool(16);
        try {
            List<Callable<Void>> messages = trips.stream().<Callable<Void>>map(trip -> () -> {
                timers.onMessage(trip + "|" + due.toEpochMilli());
                return null;
            }).toList();
            for (Future<Void> done : consumers.invokeAll(messages)) {
                done.get();
            }
        } finally {
            consumers.shutdownNow();
        }

        return pooled.queryForList("SELECT EXTRACT(EPOCH FROM min(o.offered_at) - ?)::float8 FROM fleet_schema.trip_offer o "
            + "GROUP BY o.trip_id ORDER BY 1", Double.class, java.sql.Timestamp.from(due));
    }

    private FleetDispatcher dispatcher() {
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        return new FleetDispatcher(pooled, new DataSourceTransactionManager(pool), new FleetPolicyStore(pooled, json),
            new FleetTestMode(pooled, FleetDatabase.properties(false)), roads, mock(RiderPushClient.class), json);
    }

    private FleetTimers timers(FleetDispatcher dispatcher, String mode, boolean stageLeavesCommand, String sweeper, BiConsumer<UUID, Instant> queue) {
        return new FleetTimers(pooled, dispatcher, new FleetPolicyStore(pooled, json), new DeliveryCommandWake(pooled, publisher, json), queue,
            mode, stageLeavesCommand, sweeper);
    }

    /** A new order whose stage this look opens (riders already on shift near the kitchen are asked). Returns the chef sub-order. */
    private UUID order(FleetDispatcher dispatcher) {
        UUID order = UUID.randomUUID();
        FleetDispatchFixtures.kitchen(fleet.db, order, false);
        deciding(dispatcher, order);
        return order;
    }

    /** The command's look at the order, which must leave riders deciding: the seconds until the check it asks for. */
    private double deciding(FleetDispatcher dispatcher, UUID order) {
        try {
            dispatcher.run(FleetDispatchFixtures.command(order), OptionalLong::empty, true);
            throw new AssertionError("the fleet stage is over");
        } catch (DeliveryProviderTemporarilyUnavailableException deciding) {
            return Duration.between(Instant.now(), deciding.policyDeadline()).toMillis() / 1000.0;
        }
    }

    private List<UUID> threeRiders() {
        List<UUID> riders = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            riders.add(FleetDispatchFixtures.riderOnShift(fleet, "+9198000000%02d".formatted(i), KITCHEN_LAT + 0.001 * i, KITCHEN_LNG, 5, false));
        }
        return riders;
    }

    private int offers() {
        return fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer", Integer.class);
    }

    private void declined() {
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE state = 'ACTIVE'");
    }

    /** Every offer was made this many seconds earlier, so one of 20 s made just now has run out. */
    private void ranOut(int seconds) {
        fleet.db.update("UPDATE fleet_schema.trip_offer SET offered_at = offered_at - make_interval(secs => ?), "
            + "expires_at = expires_at - make_interval(secs => ?)", seconds, seconds);
    }

    private String stageRow() {
        return fleet.db.queryForObject("SELECT string_agg(CAST(to_jsonb(s) AS text), ',') FROM fleet_schema.trip_stage s", String.class);
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<DeliveryServiceBusPublisher> provider(DeliveryServiceBusPublisher publisher) {
        ObjectProvider<DeliveryServiceBusPublisher> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(publisher);
        return provider;
    }
}
