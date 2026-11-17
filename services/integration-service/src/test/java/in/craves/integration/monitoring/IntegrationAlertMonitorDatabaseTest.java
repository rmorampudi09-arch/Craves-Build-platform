package in.craves.integration.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.FleetDatabase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

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

    private Integer count(String alert) {
        return database.db.queryForObject(IntegrationAlertMonitor.CHECKS.get(alert), Integer.class, 7);
    }

    private void attempt(String provider, String state, String stateAge, String providerRef) {
        database.db.update("INSERT INTO delivery_schema.provider_create_attempt (chef_sub_order_id, provider_id, attempt_no, client_ref, state, "
            + "provider_ref, updated_at) VALUES (?, ?, 1, ?, ?, ?, now() - CAST(? AS interval))", UUID.randomUUID(), provider,
            UUID.randomUUID().toString().substring(0, 27), state, providerRef, stateAge);
    }
}
