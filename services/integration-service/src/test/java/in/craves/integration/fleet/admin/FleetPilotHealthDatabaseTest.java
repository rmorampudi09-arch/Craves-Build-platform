package in.craves.integration.fleet.admin;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.assertj.core.api.Assertions.within;

import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.admin.FleetPilotHealth.NamedQuery;
import in.craves.integration.fleet.admin.FleetPilotHealth.Result;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** resource fleet/pilot_health.sql (docs/riders/PILOT-HEALTH.md): every named query runs on fleet data, and the numbers add up. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPilotHealthDatabaseTest {
    static final String OFFER = "INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, pay_paise, rate_card_version, "
        + "pickup_distance_m, drop_distance_m, offered_at, expires_at, decided_at, pushed_at, push_result, rang_at, rang_channel) "
        + "VALUES (?, ?, ?, 'DECLINED', 6800, '2026-10-v1', 1200, 3400, now() - INTERVAL '1 hour', now() - INTERVAL '1 hour' + "
        + "INTERVAL '40 seconds', now() - INTERVAL '59 minutes', now() - INTERVAL '1 hour', ?, %s, ?)";
    final FleetDatabase fleet = new FleetDatabase();

    @Test
    void theConsoleReportRunsEveryQueryReadOnlyAsPlainValues() {
        UUID rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update(OFFER.formatted("now() - INTERVAL '1 hour' + INTERVAL '3 seconds'"), UUID.randomUUID(), trip, rider, "SENT", "fcm");

        FleetPilotHealth.Report report = new FleetPilotHealth(fleet.db, fleet.transactions).report();
        assertThat(report.results()).extracting(Result::name).containsExactlyElementsOf(queries().keySet());
        assertThat(report.results()).allSatisfy(result -> assertThat(result.error()).as(result.name()).isNull());
        Result ring = report.results().get(0);
        assertThat(ring.description()).startsWith("From the server creating an offer to the phone ringing");
        assertThat(ring.columns()).containsExactly("channel", "model", "offers", "rang", "p50_s", "p95_s", "p99_s");
        assertThat(ring.rows().get(0)).containsExactly("all", "all", 1L, 1L, new java.math.BigDecimal("3.0"),
            new java.math.BigDecimal("3.0"), new java.math.BigDecimal("3.0"));
        Result byDay = report.results().get(1);
        assertThat((String) byDay.rows().get(0).get(0)).as("a day, not a timestamp").matches("\\d{4}-\\d{2}-\\d{2}");
        Result survival = report.results().stream().filter(result -> result.name().equals("shift_survival")).findFirst().orElseThrow();
        List<Object> shift = survival.rows().get(0);
        assertThat((String) shift.get(survival.columns().indexOf("shift_id"))).as("a UUID as text").hasSize(36);
        assertThat((String) shift.get(survival.columns().indexOf("started_at"))).as("an ISO instant").endsWith("Z");
        assertThat(shift.get(survival.columns().indexOf("open"))).isEqualTo(true);
    }

    @Test
    void aQueryThatFailsOrWritesIsReportedAndTheOthersStillRun() {
        FleetPilotHealth health = new FleetPilotHealth(fleet.db, fleet.transactions) {
            @Override
            List<NamedQuery> queries() {
                return List.of(new NamedQuery("missing_table", "", "SELECT * FROM fleet_schema.no_such_table"),
                    new NamedQuery("writes", "", "CREATE TABLE fleet_schema.pilot_health_must_not_exist (id int)"),
                    new NamedQuery("fine", "", "SELECT 1 AS one"));
            }
        };
        List<Result> results = health.report().results();
        assertThat(results.get(0).error()).contains("failed or took longer than 15s");
        assertThat(results.get(0).rows()).isEmpty();
        assertThat(results.get(1).error()).as("the transaction is read-only").isNotNull();
        assertThat(fleet.db.queryForObject("SELECT to_regclass('fleet_schema.pilot_health_must_not_exist') IS NULL", Boolean.class)).isTrue();
        assertThat(results.get(2).rows()).containsExactly(List.of(1));
        assertThat(results.get(2).error()).isNull();
    }

    @Test
    void everyQueryRunsAndOfferToRingIsTimedFromTheOfferToItsFirstArrival() {
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
        // An older app's step (no age) isn't timed; a phone clock set back between tap and send counts as 0.
        fleet.db.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, actor_id, detail) "
            + "VALUES (?, ?, 'PICKED_UP', 'RIDER', ?, '{}'), (?, ?, 'PICKED_UP', 'RIDER', ?, '{\"ageMs\": -5000}')",
            UUID.randomUUID(), trip, rider, UUID.randomUUID(), trip, rider);
        // A shift whose phone died 2 hours in and was closed at 3 hours: the silence after its last call counts.
        UUID died = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - INTERVAL '4 hours', last_seen_at = now() - INTERVAL '2 hours', "
            + "ended_at = now() - INTERVAL '1 hour' WHERE rider_id = ?", died);
        fleet.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, state, outcome, opened_at, deadline_at, closed_at) "
            + "VALUES (?, ?, 1, 'CRAVES_FLEET', 'CLOSED', 'ACCEPTED', now() - INTERVAL '1 hour', now() - INTERVAL '59 minutes', "
            + "now() - INTERVAL '59 minutes')", UUID.randomUUID(), trip);
        // Two orders from one kitchen, ready 5 minutes apart, to the same drop: a batching pair. The rider took the first,
        // from 30 to 60 minutes ago, and rode three sides of a square (about 3.28 km) to a kitchen about 1.06 km away.
        UUID first = fleet.trip(UUID.randomUUID());
        UUID second = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET chef_id = (SELECT chef_id FROM fleet_schema.trip WHERE id = ?), "
            + "chef_ready_at = now() - INTERVAL '5 minutes' WHERE id = ?", first, second);
        fleet.db.update("UPDATE fleet_schema.trip SET chef_ready_at = now() - INTERVAL '10 minutes', rider_id = ?, "
            + "accepted_at = now() - INTERVAL '60 minutes', arrived_kitchen_at = now() - INTERVAL '45 minutes', "
            + "picked_up_at = now() - INTERVAL '38 minutes', finished_at = now() - INTERVAL '30 minutes' WHERE id = ?", rider, first);
        // Ops gave the second order to another rider (V166, after the contract migration drops the old constraint): it still
        // counts once, by its current trip.
        fleet.db.execute("ALTER TABLE fleet_schema.trip DROP CONSTRAINT IF EXISTS trip_chef_sub_order_id_key");
        fleet.db.update("UPDATE fleet_schema.trip SET replaced_at = now() WHERE id = ?", second);
        fleet.db.update("INSERT INTO fleet_schema.trip (id, chef_sub_order_id, order_id, chef_id, order_code, items_count, kitchen_name, "
            + "kitchen_area, kitchen_address, kitchen_lat, kitchen_lng, chef_phone, customer_first_name, customer_phone, drop_area, drop_address, "
            + "drop_lat, drop_lng, chef_ready_at, replaces, created_at) SELECT ?, chef_sub_order_id, order_id, chef_id, order_code, items_count, "
            + "kitchen_name, kitchen_area, kitchen_address, kitchen_lat, kitchen_lng, chef_phone, customer_first_name, customer_phone, drop_area, "
            + "drop_address, drop_lat, drop_lng, chef_ready_at, id, created_at FROM fleet_schema.trip WHERE id = ?", UUID.randomUUID(), second);
        double[][] path = {{17.44, 78.40}, {17.45, 78.40}, {17.45, 78.39}, {17.44, 78.39}};
        for (int i = 0; i < path.length; i++) {
            fleet.db.update("INSERT INTO fleet_schema.trip_track (trip_id, rider_id, recorded_at, lat, lng, accuracy_m, mock) "
                + "VALUES (?, ?, now() - make_interval(mins => ?), ?, ?, 8, false)", first, rider, 58 - 4 * i, path[i][0], path[i][1]);
        }

        Map<String, String> queries = queries();
        assertThat(queries.keySet()).containsExactly("offer_to_ring", "offer_to_ring_by_day", "first_channel", "push_results",
            "shift_survival", "sync_delay", "battery_per_hour", "fleet_stage_outcomes", "batching_candidates", "rider_busy_share",
            "pickup_detour", "fcm_on_time", "offer_outcomes", "earnings_per_online_hour", "offer_rules", "rider_choices", "kitchen_wait",
            "ready_vs_promise", "courier_assign_minutes", "track_size");
        queries.forEach((name, sql) -> assertThat(fleet.db.queryForList(sql)).as(name).isNotEmpty());

        assertThat(number(fleet.db.queryForList(queries.get("offer_to_ring_by_day")).get(0), "p95_s")).isCloseTo(19.05, within(0.051));
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
        List<Map<String, Object>> shifts = fleet.db.queryForList(queries.get("shift_survival"));
        Map<String, Object> shift = shifts.get(0);
        assertThat(shift).containsEntry("model", "Redmi Note 12").containsEntry("longest_silence_s", 75).containsEntry("silences_over_60s", 1)
            .containsEntry("last_exit_reason", "LOW_MEMORY").containsEntry("open", true);
        assertThat(number(shift, "hours")).isCloseTo(2.0, within(0.02));
        assertThat(shifts.get(1)).containsEntry("open", false).containsEntry("silences_over_60s", 1).containsEntry("silent_now_s", null);
        assertThat(number(shifts.get(1), "longest_silence_s")).as("the hour after its last call").isCloseTo(3600, within(2.0));
        Map<String, Object> picked = fleet.db.queryForList(queries.get("sync_delay")).get(0);
        assertThat(picked).containsEntry("step", "PICKED_UP");
        assertThat(number(picked, "steps")).isEqualTo(3);
        assertThat(number(picked, "with_tap")).isEqualTo(2);
        assertThat(number(picked, "max_s")).isEqualTo(90.0);
        assertThat(number(picked, "p50_s")).as("0 and 90 s").isEqualTo(45.0);
        assertThat(number(fleet.db.queryForList(queries.get("battery_per_hour")).get(0), "pct_per_hour")).isEqualTo(6.0);
        assertThat(fleet.db.queryForList(queries.get("fleet_stage_outcomes")).get(0)).containsEntry("outcome", "ACCEPTED");

        Map<String, Object> batching = fleet.db.queryForList(queries.get("batching_candidates")).get(0);
        assertThat(number(batching, "orders")).isEqualTo(3);
        assertThat(number(batching, "with_pair")).as("the two from one kitchen, not the third").isEqualTo(2);
        assertThat(number(batching, "pair_pct")).isEqualTo(66.7);
        // Shifts of 2 h (open) and 3 h (closed); the trip took 30 minutes of the first. Summed, as they may start on two IST days.
        List<Map<String, Object>> busy = fleet.db.queryForList(queries.get("rider_busy_share"));
        assertThat(busy.stream().mapToDouble(row -> number(row, "online_h")).sum()).isCloseTo(5.0, within(0.001));
        assertThat(busy.stream().mapToDouble(row -> number(row, "busy_h")).sum()).isCloseTo(0.5, within(0.001));
        Map<String, Object> detour = fleet.db.queryForList(queries.get("pickup_detour")).get(0);
        assertThat(number(detour, "trips")).isEqualTo(1);
        assertThat(number(detour, "longer_than_1_5x")).isEqualTo(1);
        assertThat(number(detour, "median_ratio")).as("3284.7 m ridden over 1060.8 m straight").isCloseTo(3.10, within(0.011));
        assertThat(fleet.db.queryForList(queries.get("fcm_on_time")).get(0)).containsEntry("model", "Redmi Note 12");
        assertThat(fleet.db.queryForList(queries.get("fcm_on_time"))).extracting(row -> number(row, "pushed"), row -> number(row, "on_time"),
            row -> number(row, "on_time_pct")).as("rang by FCM within 5 s: 1, 2, 3 and 5 s; 4 s came by the location call")
            .containsExactly(tuple(20.0, 4.0, 20.0));
        assertThat(fleet.db.queryForList(queries.get("offer_outcomes"))).extracting(row -> row.get("state"), row -> number(row, "offers"),
            row -> number(row, "pct")).containsExactly(tuple("DECLINED", 21.0, 100.0));
        Map<String, Object> wait = fleet.db.queryForList(queries.get("kitchen_wait")).get(0);
        assertThat(number(wait, "trips")).as("only the trip picked up").isEqualTo(1);
        assertThat(number(wait, "p50_wait_min")).as("arrived 45 and picked up 38 minutes ago").isEqualTo(7.0);
        assertThat(number(wait, "food_ready_first")).as("the chef tapped ready after the rider arrived").isZero();
        Map<String, Object> track = fleet.db.queryForList(queries.get("track_size")).get(0);
        assertThat(number(track, "partitions")).isGreaterThanOrEqualTo(1);
        assertThat(number(track, "total_bytes")).isGreaterThan(0);
    }

    /**
     * Phase 4 fairness, on yesterday (IST) so the day is whole: A earned ₹150 in an hour, B nothing in an hour and a half
     * with a 30-minute break, C was online only 20 minutes. Pay per available hour: A ₹150, B ₹0; C is left out.
     */
    @Test
    void fairnessCountsPayPerAvailableOnlineHourAndTheSpreadBetweenRiders() {
        UUID a = shift("+919800000011", "10:00", "11:00");
        UUID b = shift("+919800000012", "10:00", "11:30");
        UUID c = shift("+919800000013", "10:00", "10:20");
        fleet.db.update("INSERT INTO fleet_schema.rider_break (id, rider_id, shift_id, started_at, ends_at) SELECT ?, rider_id, id, "
            + YESTERDAY.formatted("10:30") + ", " + YESTERDAY.formatted("11:00") + " FROM fleet_schema.rider_shift WHERE rider_id = ?",
            UUID.randomUUID(), b);
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'DELIVERED', finished_at = " + YESTERDAY.formatted("10:30")
            + ", pay_finalized_at = " + YESTERDAY.formatted("10:30") + " WHERE id = ?", a, trip);
        fleet.db.update("INSERT INTO fleet_schema.rider_earning (id, rider_id, trip_id, component, revision, business_key, gross_paise, "
            + "withheld_paise, net_paise, rate_card_version, withdrawable_at) VALUES (?, ?, ?, 'base', 1, ?, 15000, 0, 15000, '2026-10-v1', now())",
            UUID.randomUUID(), a, trip, "fleet-trip-pay/" + trip + "/base/1");
        fleet.db.update("UPDATE fleet_schema.rider SET max_drop_m = 5000 WHERE id = ?", c);
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE' WHERE id = ?", c);
        UUID offerTrip = fleet.trip(UUID.randomUUID());
        fleet.db.update(OFFER.formatted("NULL"), UUID.randomUUID(), offerTrip, a, "SENT", null);
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'ACCEPTED', round = 2, reason = '{\"rule\": \"FAIR\", \"place\": 1, "
            + "\"riders\": 2, \"atOnce\": 1, \"round\": 2}' WHERE rider_id = ?", a);

        Map<String, String> queries = queries();
        Map<String, Object> day = fleet.db.queryForList(queries.get("earnings_per_online_hour")).stream()
            .filter(row -> row.get("day_ist").toString().equals(fleet.db.queryForObject(
                "SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1)::text", String.class)))
            .findFirst().orElseThrow();
        assertThat(number(day, "riders")).as("C's 20 minutes leave C out").isEqualTo(2);
        assertThat(number(day, "p10_rupees_h")).isEqualTo(15.0);
        assertThat(number(day, "p50_rupees_h")).isEqualTo(75.0);
        assertThat(number(day, "p90_rupees_h")).isEqualTo(135.0);
        assertThat(number(day, "gini")).as("one of two riders earns it all: 0.5").isEqualTo(0.5);

        assertThat(fleet.db.queryForList(queries.get("offer_rules"))).extracting(row -> row.get("rule"), row -> number(row, "round"),
            row -> number(row, "offers"), row -> number(row, "accepted")).containsExactly(tuple("FAIR", 2.0, 1.0, 1.0));
        Map<String, Object> choices = fleet.db.queryForList(queries.get("rider_choices")).get(0);
        assertThat(number(choices, "with_farthest_drop")).isEqualTo(1);
        assertThat(number(choices, "with_farthest_pickup")).isZero();
    }

    /** A closed shift yesterday (IST) from one time to another, for a new rider. */
    private UUID shift(String phone, String from, String to) {
        UUID rider = fleet.rider("Rider " + phone, phone);
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at, ended_at, "
            + "last_seen_at) VALUES (?, ?, ?, " + YESTERDAY.formatted(to) + ", " + YESTERDAY.formatted(from) + ", " + YESTERDAY.formatted(to)
            + ", " + YESTERDAY.formatted(to) + ")",
            UUID.randomUUID(), rider, phone.substring(1).repeat(6).substring(0, 64));
        return rider;
    }

    /** A time of day yesterday in IST, as SQL. */
    static final String YESTERDAY = "((((now() AT TIME ZONE 'Asia/Kolkata')::date - 1) + TIME '%s') AT TIME ZONE 'Asia/Kolkata')";

    private static double number(Map<String, Object> row, String column) {
        return ((Number) row.get(column)).doubleValue();
    }

    /** The file in the build, through the console's own parser: name to SQL, in file order. */
    static Map<String, String> queries() {
        Map<String, String> queries = new LinkedHashMap<>();
        FleetPilotHealth.parse(FleetPilotHealth.read()).forEach(query -> queries.put(query.name(), query.sql()));
        return queries;
    }
}
