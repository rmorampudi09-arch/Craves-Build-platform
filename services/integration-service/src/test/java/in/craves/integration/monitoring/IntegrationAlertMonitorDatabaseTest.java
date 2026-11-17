package in.craves.integration.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.CourierApiUsage;
import in.craves.integration.fleet.FleetDatabase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;

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
        ListAppender<ILoggingEvent> logged = new ListAppender<>();
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

    private static void calls(String provider, int count) {
        for (int call = 0; call < count; call++) {
            CourierApiUsage.call(provider);
        }
    }

    private List<Map<String, Object>> usage() {
        return database.db.queryForList("SELECT provider_id, calls FROM delivery_schema.provider_api_usage "
            + "WHERE day = (now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY provider_id");
    }

    private static List<String> alerts(ListAppender<ILoggingEvent> logged) {
        return logged.list.stream().map(ILoggingEvent::getFormattedMessage).filter(line -> line.startsWith("CRAVES_ALERT alert=COURIER_API")).toList();
    }

    private Integer count(String alert) {
        return database.db.queryForObject(IntegrationAlertMonitor.CHECKS.get(alert), Integer.class, 7);
    }

    private void attempt(String provider, String state, String stateAge, String providerRef) {
        database.db.update("INSERT INTO delivery_schema.provider_create_attempt (chef_sub_order_id, provider_id, attempt_no, client_ref, state, "
            + "provider_ref, updated_at) VALUES (?, ?, 1, ?, ?, ?, now() - CAST(? AS interval))", UUID.randomUUID(), provider,
            UUID.randomUUID().toString().substring(0, 27), state, providerRef, stateAge);
    }
}
