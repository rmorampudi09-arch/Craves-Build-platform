package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import in.craves.integration.fleet.FleetDatabase;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;

/**
 * The shared courier breaker's row on PostgreSQL with every migration. Each CourierBreaker here stands for one replica.
 * Time is moved in the row; nothing here waits.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class CourierBreakerDatabaseTest {
    static FleetDatabase database;
    final List<String> alerts = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            if (event.getFormattedMessage().startsWith("CRAVES_ALERT")) {
                alerts.add(event.getFormattedMessage());
            }
        }
    };

    @BeforeAll
    static void migrate() {
        database = new FleetDatabase();
    }

    @BeforeEach
    void start() {
        database.db.update("DELETE FROM delivery_schema.provider_breaker");
        logged.start();
        ((Logger) LoggerFactory.getLogger(CourierBreaker.class)).addAppender(logged);
    }

    @AfterEach
    void stop() {
        ((Logger) LoggerFactory.getLogger(CourierBreaker.class)).detachAppender(logged);
    }

    @Test
    void threeFailedBookingsInARowOnDifferentReplicasOpenTheBreakerOnEveryReplicaWithOneAlert() {
        CourierBreaker a = replica();
        CourierBreaker b = replica();
        a.booked(a.admit("borzo"), Boolean.FALSE);
        b.booked(b.admit("borzo"), Boolean.FALSE);
        assertThat(a.admit("borzo").refused()).as("two failures leave it closed").isFalse();
        assertThat(alerts).isEmpty();

        a.booked(a.admit("borzo"), Boolean.FALSE);

        assertThat(a.admit("borzo").refused()).isTrue();
        assertThat(b.admit("borzo").refused()).isTrue();
        assertThat(replica().admit("borzo").refused()).as("a replica that saw none of the failures").isTrue();
        assertThat(replica().admit("pidge").refused()).as("another courier is unaffected").isFalse();
        // A booking that was already out when the breaker opened fails too: no second alert.
        b.booked(new CourierBreaker.Pass("borzo", false, true, false), Boolean.FALSE);
        assertThat(alerts).singleElement().asString()
            .isEqualTo("CRAVES_ALERT alert=COURIER_BREAKER_OPEN provider=borzo failed=bookings halfOpenSeconds=30");
    }

    @Test
    void aSuccessStartsTheCountAgainAndAHealthyCourierHasNoRow() {
        CourierBreaker replica = replica();
        CourierBreaker.Pass healthy = replica.admit("borzo");
        replica.quoted(healthy, Boolean.TRUE);
        replica.booked(healthy, Boolean.TRUE);
        replica.booked(healthy, null);
        assertThat(rows()).as("nothing is written for a courier that has not failed").isZero();

        replica.booked(replica.admit("borzo"), Boolean.FALSE);
        replica.booked(replica.admit("borzo"), Boolean.FALSE);
        // The order was refused for its own reasons: the count stays.
        replica.booked(replica.admit("borzo"), null);
        assertThat(count("booking_failures")).isEqualTo(2);
        CourierBreaker.Pass afterFailures = replica.admit("borzo");
        assertThat(afterFailures.dirty()).isTrue();
        replica.booked(afterFailures, Boolean.TRUE);
        assertThat(count("booking_failures")).isZero();

        replica.booked(replica.admit("borzo"), Boolean.FALSE);
        replica.booked(replica.admit("borzo"), Boolean.FALSE);
        assertThat(replica.admit("borzo").refused()).as("two failures since the success").isFalse();
        assertThat(alerts).isEmpty();
    }

    @Test
    void onlyOneReplicaSendsTheHalfOpenProbeAndAFailedProbeKeepsTheBreakerOpen() throws Exception {
        open("borzo");
        assertThat(replica().admit("borzo").refused()).as("no probe before the half-open time").isTrue();

        age("opened_at");
        List<CourierBreaker.Pass> passes = admitOnEightReplicasAtOnce();
        assertThat(passes).filteredOn(CourierBreaker.Pass::probe).hasSize(1);
        assertThat(passes).filteredOn(CourierBreaker.Pass::refused).hasSize(7);

        CourierBreaker replica = replica();
        replica.booked(passes.stream().filter(CourierBreaker.Pass::probe).findFirst().orElseThrow(), Boolean.FALSE);
        assertThat(replica.admit("borzo").refused()).as("a failed probe keeps it open; the next one waits its turn").isTrue();

        age("probe_at");
        passes = admitOnEightReplicasAtOnce();
        assertThat(passes).filteredOn(CourierBreaker.Pass::probe).hasSize(1);
        replica.booked(passes.stream().filter(CourierBreaker.Pass::probe).findFirst().orElseThrow(), Boolean.TRUE);

        CourierBreaker.Pass closed = replica().admit("borzo");
        assertThat(closed.refused()).isFalse();
        assertThat(closed.dirty()).isFalse();
        assertThat(alerts).as("opening alerts once; probes do not").hasSize(1);
    }

    @Test
    void aProbeThatGivesNoVerdictLeavesTheBreakerOpenForTheNextProbe() {
        open("borzo");
        age("opened_at");
        CourierBreaker replica = replica();
        assertThat(replica.read("borzo").refused()).as("a quote that books nothing does not take the probe").isTrue();
        CourierBreaker.Pass probe = replica.admit("borzo");
        assertThat(probe.probe()).isTrue();
        replica.booked(probe, null);

        assertThat(replica.admit("borzo").refused()).isTrue();
        age("probe_at");
        assertThat(replica.admit("borzo").probe()).isTrue();
    }

    @Test
    void aQuoteClosesABreakerThatQuotesOpenedButNotOneThatBookingsOpened() {
        CourierBreaker replica = replica();
        for (int failure = 1; failure <= 5; failure++) {
            assertThat(replica.admit("pidge").refused()).isFalse();
            replica.quoted(replica.admit("pidge"), Boolean.FALSE);
        }
        assertThat(replica.admit("pidge").refused()).isTrue();
        assertThat(alerts).singleElement().asString().contains("provider=pidge failed=quotes");
        age("opened_at");
        replica.quoted(replica.admit("pidge"), Boolean.TRUE);
        assertThat(replica.admit("pidge").refused()).as("the probe's quote was answered").isFalse();

        open("borzo");
        age("opened_at");
        CourierBreaker.Pass probe = replica.admit("borzo");
        replica.quoted(probe, Boolean.TRUE);
        assertThat(replica().admit("borzo").refused()).as("bookings failed; a quote proves nothing about them").isTrue();
        replica.booked(probe, Boolean.TRUE);
        assertThat(replica().admit("borzo").refused()).isFalse();
    }

    private CourierBreaker replica() {
        return new CourierBreaker(database.db, 3, 5, 30);
    }

    private void open(String providerId) {
        CourierBreaker replica = replica();
        for (int failure = 1; failure <= 3; failure++) {
            replica.booked(replica.admit(providerId), Boolean.FALSE);
        }
    }

    private void age(String column) {
        database.db.update("UPDATE delivery_schema.provider_breaker SET " + column + " = " + column + " - INTERVAL '31 seconds'");
    }

    private List<CourierBreaker.Pass> admitOnEightReplicasAtOnce() throws Exception {
        ExecutorService replicas = Executors.newFixedThreadPool(8);
        try {
            CyclicBarrier together = new CyclicBarrier(8);
            List<Callable<CourierBreaker.Pass>> calls = new ArrayList<>();
            for (int replica = 0; replica < 8; replica++) {
                CourierBreaker breaker = replica();
                calls.add(() -> {
                    together.await();
                    return breaker.admit("borzo");
                });
            }
            List<CourierBreaker.Pass> passes = new ArrayList<>();
            for (Future<CourierBreaker.Pass> call : replicas.invokeAll(calls)) {
                passes.add(call.get());
            }
            return passes;
        } finally {
            replicas.shutdownNow();
        }
    }

    private int rows() {
        return database.db.queryForObject("SELECT count(*) FROM delivery_schema.provider_breaker", Integer.class);
    }

    private int count(String column) {
        return database.db.queryForObject("SELECT " + column + " FROM delivery_schema.provider_breaker WHERE provider_id = 'borzo'", Integer.class);
    }
}
