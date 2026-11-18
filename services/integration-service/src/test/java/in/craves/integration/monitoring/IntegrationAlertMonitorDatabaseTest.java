package in.craves.integration.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import in.craves.integration.LoggedEvents;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.CourierApiUsage;
import in.craves.integration.fleet.FleetDatabase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;

/** Every alert count runs on the migrated schema, and the courier booking journal's two counts see what they should. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class IntegrationAlertMonitorDatabaseTest {
    final FleetDatabase database = new FleetDatabase();

    @Test
    void everyCheckRunsAndTheBookingJournalCountsSeeUnresolvedAndRefusedAttempts() {
        IntegrationAlertMonitor.CHECKS.forEach((alert, sql) ->
            assertThat(database.db.queryForObject(sql, Integer.class, 7)).as(alert).isNotNull());
        assertThat(count("COURIER_UNRESOLVED_BOOKING")).isZero();
        assertThat(count("COURIER_REJECTED_RATE")).isZero();

        attempt("borzo", "ORPHAN_SUSPECT", "11 minutes", null);
        attempt("borzo", "UNKNOWN", "11 minutes", null);
        attempt("borzo", "UNKNOWN", "9 minutes", null);
        attempt("borzo", "ORPHAN_SUSPECT", "11 minutes", "1250032");
        assertThat(count("COURIER_UNRESOLVED_BOOKING")).as("over 10 minutes in the state; a found orphan has its own alert").isEqualTo(2);
        assertThat(count("COURIER_REJECTED_RATE")).as("no refusals yet").isZero();

        attempt("pidge", "CONFIRMED", "1 minute", "PG-1");
        attempt("pidge", "CONFIRMED", "1 minute", "PG-2");
        attempt("pidge", "REJECTED", "1 minute", null);
        assertThat(count("COURIER_REJECTED_RATE")).as("1 of 3 Pidge bookings refused").isEqualTo(1);
    }

    @Test
    void courierApiUsageIsWrittenOnlyWithItsFlagSummedOverReplicasAndAlertedOnceADayAtTheShareOfTheCap() {
        LoggedEvents logged = new LoggedEvents();
        logged.start();
        ((Logger) LoggerFactory.getLogger(IntegrationAlertMonitor.class)).addAppender(logged);
        try {
            DeliveryCommandProperties properties = new DeliveryCommandProperties();
            properties.setProviderApiDailyCaps(Map.of("borzo", 10, "pidge", 0));
            IntegrationAlertMonitor monitor = new IntegrationAlertMonitor(database.db, 7);
            IntegrationAlertMonitor otherReplica = new IntegrationAlertMonitor(database.db, 7);
            monitor.setDeliveryProperties(properties);
            otherReplica.setDeliveryProperties(properties);
            CourierApiUsage.drainCalls();
            CourierApiUsage.drainRateLimited();

            calls("borzo", 6);
            monitor.check();
            assertThat(usage()).as("off: nothing is written, and the calls stay counted").isEmpty();
            assertThat(alerts(logged)).isEmpty();

            properties.setProviderApiUsageEnabled(true);
            monitor.check();
            assertThat(usage()).containsExactly(Map.of("provider_id", "borzo", "calls", 6));
            assertThat(alerts(logged)).as("6 of 10 is under 70%").isEmpty();

            calls("borzo", 1);
            calls("pidge", 50);
            CourierApiUsage.rateLimited("pidge");
            otherReplica.check();
            assertThat(usage()).containsExactly(Map.of("provider_id", "borzo", "calls", 7), Map.of("provider_id", "pidge", "calls", 50));
            assertThat(alerts(logged)).containsExactlyInAnyOrder("CRAVES_ALERT alert=COURIER_API_USAGE_HIGH provider=borzo calls=7 cap=10 percent=70",
                "CRAVES_ALERT alert=COURIER_API_RATE_LIMITED provider=pidge count=1");

            calls("borzo", 5);
            monitor.check();
            otherReplica.check();
            assertThat(usage().get(0)).containsEntry("calls", 12);
            assertThat(alerts(logged)).as("once a day for a courier, whichever replica runs").hasSize(2);

            // The write fails: the calls are kept for the next run, and the money and delivery checks are not disturbed.
            calls("borzo", 3);
            database.db.execute("ALTER TABLE delivery_schema.provider_api_usage RENAME TO provider_api_usage_away");
            try {
                monitor.check();
            } finally {
                database.db.execute("ALTER TABLE delivery_schema.provider_api_usage_away RENAME TO provider_api_usage");
            }
            monitor.check();
            assertThat(usage().get(0)).containsEntry("calls", 15);
        } finally {
            ((Logger) LoggerFactory.getLogger(IntegrationAlertMonitor.class)).detachAppender(logged);
        }
    }

    @Test
    void anOrderARiderAndSomeoneElseBothHoldIsLoggedOnlyWithTheFlagOn() {
        LoggedEvents logged = new LoggedEvents();
        logged.start();
        ((Logger) LoggerFactory.getLogger(IntegrationAlertMonitor.class)).addAppender(logged);
        try {
            // In one transaction that is rolled back, so the dropped constraint and every row are back afterwards.
            new TransactionTemplate(database.transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            // Held by a rider and by a live Borzo job; the next three are held by their rider alone.
            Held withCourier = held("ASSIGNED", "+919000000011");
            job(withCourier, "borzo", "BZ-1", "COURIER_ASSIGNED");
            job(held("AT_PICKUP", "+919000000012"), "craves_fleet", null, "COURIER_ASSIGNED");
            job(held("PICKED_UP", "+919000000013"), "pidge", "PG-9", "CANCELLED");
            Held cancelledStray = held("ASSIGNED", "+919000000014");
            attempt(cancelledStray.order(), "borzo", "CANCELLED", "3 minutes", "BZ-2");
            attempt(cancelledStray.order(), "pidge", "ORPHAN_SUSPECT", "1 minute", "PG-2");
            // A Pidge booking that is not the job, still not cancelled after 3 minutes.
            Held withStray = held("AT_PICKUP", "+919000000015");
            attempt(withStray.order(), "pidge", "ORPHAN_SUSPECT", "3 minutes", "PG-3");
            // A trip given to another rider that its first rider still holds.
            database.db.execute("ALTER TABLE fleet_schema.trip DROP CONSTRAINT IF EXISTS trip_chef_sub_order_id_key");
            Held first = held("ASSIGNED", "+919000000016");
            database.db.update("UPDATE fleet_schema.trip SET replaced_at = now() WHERE id = ?", first.trip());
            Held second = held(first.order(), "ASSIGNED", "+919000000017");
            // The same Borzo job once its rider's trip is over: nobody else holds it.
            Held finished = held("DELIVERED", "+919000000018");
            job(finished, "borzo", "BZ-4", "COURIER_ASSIGNED");

            IntegrationAlertMonitor monitor = new IntegrationAlertMonitor(database.db, 7);
            monitor.check();
            assertThat(doubleHolds(logged)).as("off by default").isEmpty();

            monitor.setFleetDoubleHold(true);
            monitor.check();
            Held lower = first.trip().toString().compareTo(second.trip().toString()) < 0 ? first : second;
            Held higher = lower == first ? second : first;
            assertThat(doubleHolds(logged)).containsExactlyInAnyOrder(
                line("COURIER_JOB", withCourier, "borzo", "BZ-1"),
                line("STRAY_BOOKING", withStray, "pidge", "PG-3"),
                line("SECOND_RIDER", lower, "craves_fleet", higher.trip().toString()));

            // A query that fails is logged, never thrown: the job's next run is not lost.
            database.db.execute("ALTER TABLE fleet_schema.trip RENAME TO trip_away");
            assertThatCode(monitor::check).doesNotThrowAnyException();
            assertThat(doubleHolds(logged)).hasSize(3);
            });
            assertThat(database.db.queryForObject("SELECT count(*) FROM pg_constraint WHERE conrelid = 'fleet_schema.trip'::regclass "
                + "AND conname = 'trip_chef_sub_order_id_key' AND contype = 'u'", Integer.class)).as("the schema is as it was").isEqualTo(1);
            assertThat(database.db.queryForObject("SELECT count(*) FROM fleet_schema.trip", Integer.class)).isZero();
        } finally {
            ((Logger) LoggerFactory.getLogger(IntegrationAlertMonitor.class)).detachAppender(logged);
        }
    }

    private record Held(UUID trip, UUID order, UUID rider) {
    }

    private Held held(String state, String phone) {
        return held(UUID.randomUUID(), state, phone);
    }

    private Held held(UUID order, String state, String phone) {
        UUID rider = database.rider("Rider " + phone.substring(11), phone);
        UUID trip = database.trip(order);
        database.db.update("UPDATE fleet_schema.trip SET state = ?, rider_id = ? WHERE id = ?", state, rider, trip);
        return new Held(trip, order, rider);
    }

    private void job(Held held, String provider, String providerDeliveryId, String status) {
        database.db.update("""
            INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status,
              provider_status, quote_snapshot, booked_at, last_status_observed_at, last_status_source, next_tracking_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'ASSIGNED', '[]'::jsonb, now(), now(), 'CREATE', now(), now(), now())""",
            UUID.randomUUID(), held.order(), UUID.randomUUID(), provider, providerDeliveryId, status);
    }

    private static String line(String source, Held held, String holder, String holderRef) {
        return "CRAVES_ALERT alert=FLEET_DOUBLE_HOLD source=" + source + " trip=" + held.trip() + " chefSubOrderId=" + held.order()
            + " rider=" + held.rider() + " holder=" + holder + " holderRef=" + holderRef;
    }

    private static List<String> doubleHolds(LoggedEvents logged) {
        return logged.list.stream().map(ILoggingEvent::getFormattedMessage)
            .filter(line -> line.startsWith("CRAVES_ALERT alert=FLEET_DOUBLE_HOLD ")).toList();
    }

    private static void calls(String provider, int count) {
        for (int call = 0; call < count; call++) {
            CourierApiUsage.call(provider);
        }
    }

    private List<Map<String, Object>> usage() {
        return database.db.queryForList("SELECT provider_id, calls FROM delivery_schema.provider_api_usage "
            + "WHERE day = (now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY provider_id");
    }

    private static List<String> alerts(LoggedEvents logged) {
        return logged.list.stream().map(ILoggingEvent::getFormattedMessage).filter(line -> line.startsWith("CRAVES_ALERT alert=COURIER_API")).toList();
    }

    private Integer count(String alert) {
        return database.db.queryForObject(IntegrationAlertMonitor.CHECKS.get(alert), Integer.class, 7);
    }

    private void attempt(String provider, String state, String stateAge, String providerRef) {
        attempt(UUID.randomUUID(), provider, state, stateAge, providerRef);
    }

    private void attempt(UUID chefSubOrderId, String provider, String state, String stateAge, String providerRef) {
        database.db.update("INSERT INTO delivery_schema.provider_create_attempt (chef_sub_order_id, provider_id, attempt_no, client_ref, state, "
            + "provider_ref, updated_at) VALUES (?, ?, 1, ?, ?, ?, now() - CAST(? AS interval))", chefSubOrderId, provider,
            UUID.randomUUID().toString().substring(0, 27), state, providerRef, stateAge);
    }
}
