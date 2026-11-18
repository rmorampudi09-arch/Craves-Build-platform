package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.zaxxer.hikari.HikariDataSource;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.command.DeliveryServiceBusPublisher;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import java.sql.Connection;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/**
 * CRAVES_FLEET_STAGE_SWEEPER on PostgreSQL with every migration: what a look stores, which stages a sweep claims, and that
 * the orders' offers are the same with it on as off. Times are moved in the rows; nothing here waits.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetStageSweeperDatabaseTest {
    static FleetDatabase fleet;
    /** Pooled connections for the code under test: FleetDatabase's own data source opens one for every statement. */
    static HikariDataSource pool;
    static JdbcTemplate pooled;
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final DeliveryCommandRepository commands = new DeliveryCommandRepository(fleet.db, json);
    /** The sweeper's alert lines, in a list that is safe to read while other threads log. */
    final List<String> caught = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            if (event.getFormattedMessage().startsWith("CRAVES_ALERT alert=FLEET_SWEEPER_CAUGHT")) {
                caught.add(event.getFormattedMessage());
            }
        }
    };

    @BeforeAll
    static void migrate() {
        fleet = new FleetDatabase();
        pool = new HikariDataSource();
        pool.setJdbcUrl(System.getenv("LEDGER_TEST_JDBC_URL"));
        pool.setUsername(System.getenv("LEDGER_TEST_DB_USER"));
        pool.setPassword(System.getenv("LEDGER_TEST_DB_PASSWORD"));
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
        ((Logger) LoggerFactory.getLogger(FleetStageSweeper.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(FleetStageSweeper.class)).detachAppender(logged);
    }

    @Test
    void offSweepsNothing() {
        UUID stage = stage("now() - INTERVAL '1 minute'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '1 minute'");
        String before = row(stage);

        assertThat(sweeper("off").sweep()).isZero();
        assertThat(sweeper(" ").sweep()).isZero();

        assertThat(row(stage)).isEqualTo(before);
        verifyNoInteractions(publisher);
        assertThat(caught).isEmpty();
        assertThatThrownBy(() -> sweeper("enforce")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void anOverdueStageNobodyIsWorkingOnGetsItsCommandOneMessage() {
        UUID waiting = stage("now() - INTERVAL '20 seconds'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds'");
        UUID failed = stage("now() - INTERVAL '20 seconds'", "FAILED", "attempt_count = 1");
        UUID leaseOver = stage("now() - INTERVAL '20 seconds'", "PROCESSING", "processing_started_at = now() - INTERVAL '11 minutes'");
        // No look ever stored a time: the deadline is the next look.
        UUID never = stage("NULL", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds'");
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '5 minutes', deadline_at = now() - INTERVAL '20 seconds' "
            + "WHERE id = ?", never);
        // Nobody can run these: claimed and reported, nothing sent.
        UUID completed = stage("now() - INTERVAL '20 seconds'", "COMPLETED", "updated_at = now()");
        UUID noCommand = stage("now() - INTERVAL '20 seconds'", null, null);
        // Inside the margin, not due, a pass holds the command, closed, a courier's stage, or too old to touch.
        stage("now() - INTERVAL '5 seconds'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '5 seconds'");
        stage("now() + INTERVAL '5 seconds'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() + INTERVAL '5 seconds'");
        stage("NULL", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() + INTERVAL '5 seconds'");
        stage("now() - INTERVAL '20 seconds'", "PROCESSING", "processing_started_at = now() - INTERVAL '9 minutes'");
        UUID closed = stage("now() - INTERVAL '20 seconds'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds'");
        fleet.db.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = 'ACCEPTED', closed_at = now() WHERE id = ?", closed);
        UUID courier = stage("now() - INTERVAL '20 seconds'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds'");
        fleet.db.update("UPDATE fleet_schema.trip_stage SET provider = 'BORZO' WHERE id = ?", courier);
        UUID old = stage("now() - INTERVAL '30 minutes'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '30 minutes'");
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '40 minutes', deadline_at = now() - INTERVAL '20 minutes' "
            + "WHERE id = ?", old);
        String commandsBefore = commandRows();

        assertThat(sweeper("on").sweep()).isEqualTo(6);

        ArgumentCaptor<DeliveryCommandMessage> sent = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        ArgumentCaptor<String> ids = ArgumentCaptor.forClass(String.class);
        verify(publisher, times(4)).publishNow(sent.capture(), ids.capture());
        assertThat(sent.getAllValues()).extracting(DeliveryCommandMessage::chefSubOrderId)
            .containsExactlyInAnyOrder(order(waiting), order(failed), order(leaseOver), order(never));
        assertThat(ids.getAllValues()).allMatch(id -> id.startsWith("fleet-sweep:")).doesNotHaveDuplicates();
        assertThat(commandRows()).as("the sweeper never writes a command: the worker's claim decides").isEqualTo(commandsBefore);
        assertThat(caught).hasSize(6).allMatch(line -> line.contains("mode=on") && line.contains("lateSeconds=2"));
        assertThat(caught).filteredOn(line -> line.contains("sent=true")).hasSize(4);
        assertThat(caught).filteredOn(line -> line.contains("sent=false"))
            .anyMatch(line -> line.contains("trip=" + trip(completed)) && line.contains("commandStatus=COMPLETED"))
            .anyMatch(line -> line.contains("trip=" + trip(noCommand)) && line.contains("commandStatus=NONE"));
        assertThat(commands.claim(fleet.db.queryForObject("SELECT id FROM delivery_schema.delivery_command WHERE chef_sub_order_id = ?",
            UUID.class, order(waiting)), 5)).as("the message that was sent finds the command claimable").isPresent();

        // The claim holds for one margin: no replica takes the same stage again before then.
        assertThat(sweeper("on").sweep()).isZero();
        verify(publisher, times(4)).publishNow(any(), anyString());
        // Still nobody a margin later: sent again, under another id.
        fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() - INTERVAL '11 seconds' WHERE id = ?", failed);
        assertThat(sweeper("on").sweep()).isOne();
        ArgumentCaptor<String> all = ArgumentCaptor.forClass(String.class);
        verify(publisher, times(5)).publishNow(any(), all.capture());
        assertThat(all.getAllValues()).doesNotHaveDuplicates();
    }

    @Test
    void shadowCountsAndSendsNothingAndAFailedSendOrNoPublisherIsReported() {
        UUID stage = stage("now() - INTERVAL '20 seconds'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds'");

        assertThat(sweeper("shadow").sweep()).isOne();
        verifyNoInteractions(publisher);
        assertThat(caught).singleElement().asString().contains("mode=shadow", "commandStatus=WAITING_FOR_PROVIDER", "sent=false");

        fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() - INTERVAL '11 seconds' WHERE id = ?", stage);
        assertThat(new FleetStageSweeper(fleet.db, json, provider(null), properties, "on", 10).sweep()).isOne();
        assertThat(caught).last().asString().contains("mode=on", "sent=false");

        fleet.db.update("UPDATE fleet_schema.trip_stage SET next_match_at = now() - INTERVAL '11 seconds' WHERE id = ?", stage);
        doThrow(new IllegalStateException("Service Bus is down")).when(publisher).publishNow(any(), anyString());
        assertThat(sweeper("on").sweep()).isOne();
        assertThat(caught).last().asString().contains("sent=false reason=IllegalStateException");
    }

    @Test
    void aStageWhoseRowALookHoldsIsLeft() throws Exception {
        UUID stage = stage("now() - INTERVAL '20 seconds'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds'");
        try (Connection look = fleet.dataSource.getConnection()) {
            look.setAutoCommit(false);
            try (var lock = look.prepareStatement("SELECT 1 FROM fleet_schema.trip_stage WHERE id = ? FOR UPDATE")) {
                lock.setObject(1, stage);
                lock.execute();
            }
            assertThat(sweeper("on").sweep()).as("skipped, not waited for").isZero();
            look.rollback();
        }
        assertThat(sweeper("on").sweep()).isOne();
    }

    @Test
    void replicasSweepingAtOnceSendOneMessageAStage() throws Exception {
        for (int i = 0; i < 12; i++) {
            stage("now() - INTERVAL '1 minute'", "WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '1 minute'");
        }
        Callable<Integer> sweep = () -> sweeper("on").sweep();
        int claimed = 0;
        var pool = Executors.newFixedThreadPool(4);
        try {
            for (var done : pool.invokeAll(List.of(sweep, sweep, sweep, sweep))) {
                claimed += done.get();
            }
        } finally {
            pool.shutdown();
        }
        assertThat(claimed).isEqualTo(12);
        ArgumentCaptor<DeliveryCommandMessage> sent = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        verify(publisher, times(12)).publishNow(sent.capture(), anyString());
        assertThat(sent.getAllValues()).extracting(DeliveryCommandMessage::chefSubOrderId).doesNotHaveDuplicates();
    }

    /**
     * One order under the owner's rule, looked at as its command would: asked, deciding, declined, run out, everyone asked,
     * asked again, no time left, deadline. With the sweeper on (and sweeping after every look) the offers, each look's next check and the
     * stage's end are what they are with it off; on also stores each look's next check on the stage.
     */
    @Test
    void theSameOffersTheSameNextChecksAndTheSameEndWithTheSweeperOnAsOff() {
        List<String> off = story("off");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_stage WHERE next_match_at IS NOT NULL", Integer.class))
            .as("off stores nothing").isZero();
        fleet.db.execute("TRUNCATE fleet_schema.rider, fleet_schema.trip CASCADE");

        List<String> on = story("on");

        assertThat(on).isEqualTo(off);
        assertThat(off).containsExactly(
            "look 1: next check in 5 s", "look 2: next check in 5 s", "look 3: next check in 5 s", "look 4: next check in 5 s",
            "look 5: next check in 5 s", "look 6: next check in 5 s", "look 7: next check in 2 s", "look 8: fleet stage over",
            "round 1 rider 1 for 20 s DECLINED", "round 2 rider 2 for 20 s EXPIRED", "round 3 rider 3 for 20 s DECLINED",
            "round 4 rider 1 for 20 s EXPIRED", "stage CLOSED:NO_ACCEPT", "trip BORZO");
        verifyNoInteractions(publisher);
        assertThat(caught).isEmpty();
    }

    /** The story's looks, then its offers in the order they were made (riders by distance from the kitchen), stage and trip. */
    private List<String> story(String mode) {
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        FleetDispatcher dispatcher = new FleetDispatcher(pooled, new DataSourceTransactionManager(pool),
            new FleetPolicyStore(pooled, json), new FleetTestMode(pooled, FleetDatabase.properties(false)), roads, mock(RiderPushClient.class), json);
        dispatcher.setStageSweeper(mode);
        FleetStageSweeper sweeper = sweeper(mode);
        UUID chefSubOrderId = UUID.randomUUID();
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, false);
        DeliveryCommandMessage command = FleetDispatchFixtures.command(chefSubOrderId);
        List<UUID> riders = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            riders.add(FleetDispatchFixtures.riderOnShift(fleet, "+9198000000%02d".formatted(i), KITCHEN_LAT + 0.001 * i, KITCHEN_LNG, 5, false));
        }
        List<String> story = new ArrayList<>();
        Runnable look = () -> {
            String line = "look " + (story.size() + 1) + ": ";
            try {
                dispatcher.run(command, OptionalLong::empty, true);
                story.add(line + "fleet stage over");
            } catch (DeliveryProviderTemporarilyUnavailableException deciding) {
                double seconds = Duration.between(Instant.now(), deciding.policyDeadline()).toMillis() / 1000.0;
                story.add(line + "next check in " + Math.round(seconds) + " s");
                Double stored = fleet.db.queryForObject("SELECT EXTRACT(EPOCH FROM next_match_at - now()) FROM fleet_schema.trip_stage "
                    + "WHERE state = 'OPEN'", Double.class);
                if ("off".equals(mode)) {
                    assertThat(stored).isNull();
                } else {
                    assertThat(stored).as("the look's own next check, on the stage").isCloseTo(seconds, within(1.0));
                }
            }
            assertThat(sweeper.sweep()).as("a stage whose looks come on time is never swept").isZero();
        };
        look.run(); // opens: the nearest rider is asked
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
        look.run(); // the deadline: Borzo next
        story.addAll(fleet.db.query("SELECT round, rider_id, EXTRACT(EPOCH FROM expires_at - offered_at)::int AS seconds, state "
            + "FROM fleet_schema.trip_offer ORDER BY round", (row, n) -> "round " + row.getInt("round") + " rider "
            + (riders.indexOf(row.getObject("rider_id", UUID.class)) + 1) + " for " + row.getInt("seconds") + " s " + row.getString("state")));
        story.add("stage " + fleet.db.queryForObject("SELECT state || ':' || outcome FROM fleet_schema.trip_stage WHERE provider = 'CRAVES_FLEET'",
            String.class));
        story.add("trip " + fleet.db.queryForObject("SELECT provider FROM fleet_schema.trip", String.class));
        return story;
    }

    private void declined() {
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE state = 'ACTIVE'");
    }

    /** Every offer was made this many seconds earlier, so one of 20 s made just now has run out. */
    private void ranOut(int seconds) {
        fleet.db.update("UPDATE fleet_schema.trip_offer SET offered_at = offered_at - make_interval(secs => ?), "
            + "expires_at = expires_at - make_interval(secs => ?)", seconds, seconds);
    }

    private FleetStageSweeper sweeper(String mode) {
        return new FleetStageSweeper(pooled, json, provider(publisher), properties, mode, 10);
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<DeliveryServiceBusPublisher> provider(DeliveryServiceBusPublisher publisher) {
        ObjectProvider<DeliveryServiceBusPublisher> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(publisher);
        return provider;
    }

    /**
     * An open fleet stage a minute old with four minutes left and this next look (SQL), and its order's command in this
     * status with these columns (no command for a null status). Returns the stage id.
     */
    private UUID stage(String nextMatchAt, String commandStatus, String commandColumns) {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID stage = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, opened_at, deadline_at, next_match_at) VALUES "
            + "(?, ?, 1, 'CRAVES_FLEET', now() - INTERVAL '1 minute', now() + INTERVAL '4 minutes', " + nextMatchAt + ")", stage,
            fleet.trip(chefSubOrderId));
        if (commandStatus != null) {
            UUID id = commands.createOrFind(FleetDispatchFixtures.command(chefSubOrderId)).id();
            fleet.db.update("UPDATE delivery_schema.delivery_command SET status = ?, provider_wait_started_at = now(), "
                + "next_provider_retry_at = now() + INTERVAL '1 hour', updated_at = now() - INTERVAL '1 minute' WHERE id = ?", commandStatus, id);
            fleet.db.update("UPDATE delivery_schema.delivery_command SET " + commandColumns + " WHERE id = ?", id);
        }
        return stage;
    }

    private UUID trip(UUID stage) {
        return fleet.db.queryForObject("SELECT trip_id FROM fleet_schema.trip_stage WHERE id = ?", UUID.class, stage);
    }

    private UUID order(UUID stage) {
        return fleet.db.queryForObject("SELECT t.chef_sub_order_id FROM fleet_schema.trip t JOIN fleet_schema.trip_stage s ON s.trip_id = t.id "
            + "WHERE s.id = ?", UUID.class, stage);
    }

    private String row(UUID stage) {
        return fleet.db.queryForObject("SELECT CAST(to_jsonb(s) AS text) FROM fleet_schema.trip_stage s WHERE id = ?", String.class, stage);
    }

    private String commandRows() {
        return fleet.db.queryForObject("SELECT string_agg(CAST(to_jsonb(c) AS text), ',' ORDER BY c.id) FROM delivery_schema.delivery_command c",
            String.class);
    }
}
