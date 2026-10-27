package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.assertj.core.api.Assertions.within;

import in.craves.integration.fleet.FleetDatabase;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** scripts/riders/pilot_health.sql (docs/riders/PILOT-HEALTH.md): every named query runs on fleet data, and the numbers add up. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPilotHealthDatabaseTest {
    static final String OFFER = "INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, pay_paise, rate_card_version, "
        + "pickup_distance_m, drop_distance_m, offered_at, expires_at, decided_at, pushed_at, push_result, rang_at, rang_channel) "
        + "VALUES (?, ?, ?, 'DECLINED', 6800, '2026-10-v1', 1200, 3400, now() - INTERVAL '1 hour', now() - INTERVAL '1 hour' + "
        + "INTERVAL '40 seconds', now() - INTERVAL '59 minutes', now() - INTERVAL '1 hour', ?, %s, ?)";
    final FleetDatabase fleet = new FleetDatabase();

    @Test
    void everyQueryRunsAndOfferToRingIsTimedFromTheOfferToItsFirstArrival() throws IOException {
        UUID rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET device_id = (SELECT id FROM fleet_schema.rider_device WHERE rider_id = ?), "
            + "started_at = now() - INTERVAL '2 hours', max_silence_seconds = 75, silences_over_60s = 1, "
            + "health = '{\"drainPct\": 6.0, \"unpluggedMin\": 60, \"lastExitReason\": \"LOW_MEMORY\"}' WHERE rider_id = ?", rider, rider);
        UUID trip = fleet.trip(UUID.randomUUID());
        // 20 offers that rang 1 to 20 s after they were made, every fourth first by the location call; one never rang.
        for (int seconds = 1; seconds <= 20; seconds++) {
            fleet.db.update(OFFER.formatted("now() - INTERVAL '1 hour' + make_interval(secs => ?)"), UUID.randomUUID(), trip, rider, "SENT",
                seconds, seconds % 4 == 0 ? "locations" : "fcm");
        }
        fleet.db.update(OFFER.formatted("NULL"), UUID.randomUUID(), trip, rider, "NO_TOKEN", null);
        fleet.db.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, actor_id, detail) "
            + "VALUES (?, ?, 'PICKED_UP', 'RIDER', ?, '{\"ageMs\": 90000}')", UUID.randomUUID(), trip, rider);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, state, outcome, opened_at, deadline_at, closed_at) "
            + "VALUES (?, ?, 1, 'CRAVES_FLEET', 'CLOSED', 'ACCEPTED', now() - INTERVAL '1 hour', now() - INTERVAL '59 minutes', "
            + "now() - INTERVAL '59 minutes')", UUID.randomUUID(), trip);

        Map<String, String> queries = queries();
        assertThat(queries.keySet()).containsExactly("offer_to_ring", "first_channel", "push_results", "shift_survival", "sync_delay",
            "battery_per_hour", "fleet_stage_outcomes");
        queries.forEach((name, sql) -> assertThat(fleet.db.queryForList(sql)).as(name).isNotEmpty());

        List<Map<String, Object>> ring = fleet.db.queryForList(queries.get("offer_to_ring"));
        Map<String, Object> all = ring.get(0);
        assertThat(all).containsEntry("channel", "all").containsEntry("model", "all");
        assertThat(number(all, "offers")).as("the offer that never rang counts").isEqualTo(21);
        assertThat(number(all, "rang")).isEqualTo(20);
        assertThat(number(all, "p50_s")).isCloseTo(10.5, within(0.051));
        assertThat(number(all, "p95_s")).as("95th percentile of 1..20 s").isCloseTo(19.05, within(0.051));
        assertThat(number(all, "p99_s")).isCloseTo(19.81, within(0.051));
        assertThat(ring).anySatisfy(row -> assertThat(row).containsEntry("channel", "fcm").containsEntry("model", "Redmi Note 12"))
            .anySatisfy(row -> assertThat(row).containsEntry("channel", "never rang").containsEntry("model", "all"));

        assertThat(fleet.db.queryForList(queries.get("first_channel"))).extracting(row -> row.get("first_channel"), row -> number(row, "offers"))
            .containsExactly(tuple("fcm", 15.0), tuple("locations", 5.0), tuple("never rang", 1.0));
        assertThat(fleet.db.queryForList(queries.get("push_results")).get(0)).containsEntry("push_result", "SENT");
        Map<String, Object> shift = fleet.db.queryForList(queries.get("shift_survival")).get(0);
        assertThat(shift).containsEntry("model", "Redmi Note 12").containsEntry("longest_silence_s", 75).containsEntry("silences_over_60s", 1)
            .containsEntry("last_exit_reason", "LOW_MEMORY").containsEntry("open", true);
        assertThat(number(shift, "hours")).isCloseTo(2.0, within(0.02));
        assertThat(number(fleet.db.queryForList(queries.get("sync_delay")).get(0), "p95_s")).isEqualTo(90.0);
        assertThat(number(fleet.db.queryForList(queries.get("battery_per_hour")).get(0), "pct_per_hour")).isEqualTo(6.0);
        assertThat(fleet.db.queryForList(queries.get("fleet_stage_outcomes")).get(0)).containsEntry("outcome", "ACCEPTED");
    }

    private static double number(Map<String, Object> row, String column) {
        return ((Number) row.get(column)).doubleValue();
    }

    /** The file's queries by their "-- name:" line, in file order; the header above the first one is skipped. */
    static Map<String, String> queries() throws IOException {
        Map<String, String> queries = new LinkedHashMap<>();
        String name = null;
        StringBuilder sql = new StringBuilder();
        for (String line : Files.readAllLines(sqlFile())) {
            if (line.startsWith("-- name: ")) {
                if (name != null) {
                    queries.put(name, sql.toString().strip().replaceAll(";$", ""));
                }
                name = line.substring("-- name: ".length()).strip();
                sql.setLength(0);
            } else if (name != null) {
                sql.append(line).append('\n');
            }
        }
        if (name != null) {
            queries.put(name, sql.toString().strip().replaceAll(";$", ""));
        }
        return queries;
    }

    /** Maven runs tests in the service's folder; the script lives at the repo root. */
    private static Path sqlFile() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path file = dir.resolve("scripts/riders/pilot_health.sql");
            if (Files.isRegularFile(file)) {
                return file;
            }
        }
        throw new IllegalStateException("scripts/riders/pilot_health.sql not found above " + Path.of("").toAbsolutePath());
    }
}
