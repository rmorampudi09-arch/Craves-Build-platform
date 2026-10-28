package in.craves.integration.fleet.dispatch;

import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.dispatch.FleetReplay.Report;
import in.craves.integration.fleet.dispatch.FleetReplay.Settings;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/**
 * Writes the replay report (markdown and CSV) for a date range and pilot area from the integration database. Not a test:
 * a main class run by hand (exec:java, test classpath) with FLEET_REPLAY_JDBC_URL set, on a read-only session, so no
 * test suite or release gate expects it. How to run it: docs/riders/REPLAY.md.
 */
public final class FleetReplayRunner {
    private FleetReplayRunner() {
    }

    public static void main(String[] args) throws Exception {
        String[] center = env("FLEET_REPLAY_CENTER", null).split(",");
        Settings settings = new Settings(LocalDate.parse(env("FLEET_REPLAY_FROM", null)), LocalDate.parse(env("FLEET_REPLAY_TO", null)),
            Double.parseDouble(center[0].trim()), Double.parseDouble(center[1].trim()), Double.parseDouble(env("FLEET_REPLAY_RADIUS_KM", "5")),
            Integer.parseInt(env("FLEET_REPLAY_RIDERS", "5")), FleetReplay.parseHours(env("FLEET_REPLAY_SHIFT_HOURS", "11-15,19-23")),
            Double.parseDouble(env("FLEET_REPLAY_ACCEPT_RATE", "1")), Long.parseLong(env("FLEET_REPLAY_HOURLY_COST_PAISE", "4000")),
            Long.parseLong(env("FLEET_REPLAY_SEED", "1")));
        SingleConnectionDataSource source = new SingleConnectionDataSource(env("FLEET_REPLAY_JDBC_URL", null),
            System.getenv("FLEET_REPLAY_DB_USER"), System.getenv("FLEET_REPLAY_DB_PASSWORD"), true);
        try {
            JdbcTemplate jdbc = new JdbcTemplate(source);
            jdbc.execute("SET default_transaction_read_only = on"); // a replay only reads, whatever the login may do
            FleetPolicyStore store = new FleetPolicyStore(jdbc, JsonMapper.builder().findAndAddModules().build());
            RateCard card = store.currentRateCard().orElseThrow(() -> new IllegalStateException("No rate card in fleet_schema.rate_card"));
            // The policy in force; before one is published, the newest draft. Its mode does not matter: a replay is shadow.
            DispatchPolicy policy = store.currentDispatchPolicy().orElseGet(() -> jdbc.queryForObject("""
                SELECT version, effective_from, mode, offer_seconds, fleet_stage_seconds, radius_m, pickup_detour_percent,
                       per_order_overhead_paise, cost_guard_premium_paise, pidge_stage_seconds, offers_at_once, offer_rounds, fair_band_m
                FROM fleet_schema.dispatch_policy ORDER BY created_at DESC LIMIT 1""", (row, n) -> new DispatchPolicy(row.getString("version"),
                row.getTimestamp("effective_from").toInstant(), row.getString("mode"), row.getInt("offer_seconds"), row.getInt("fleet_stage_seconds"),
                row.getInt("radius_m"), row.getInt("pickup_detour_percent"), row.getLong("per_order_overhead_paise"),
                row.getLong("cost_guard_premium_paise"), row.getInt("pidge_stage_seconds"), row.getInt("offers_at_once"),
                row.getInt("offer_rounds"), row.getInt("fair_band_m"))));
            Report report = FleetReplay.run(FleetReplay.load(jdbc, settings), card, withRules(policy), settings);
            Path out = Path.of(env("FLEET_REPLAY_OUT", "target/fleet-replay"));
            Files.createDirectories(out);
            String name = "fleet-replay-" + settings.from() + "-" + settings.to();
            Files.writeString(out.resolve(name + ".md"), FleetReplay.markdown(report));
            Files.writeString(out.resolve(name + ".csv"), FleetReplay.csv(report));
            System.out.println("FLEET_REPLAY " + report.rows().size() + " orders; wrote " + out.resolve(name + ".md").toAbsolutePath()
                + " and " + name + ".csv");
        } finally {
            source.destroy();
        }
    }

    /**
     * The policy with FLEET_REPLAY_OFFERS_AT_ONCE, FLEET_REPLAY_OFFER_ROUNDS and FLEET_REPLAY_FAIR_BAND_M (metres) in place
     * of its offer rules where set, inside the bounds a policy may have, to compare rules on the same orders.
     */
    static DispatchPolicy withRules(DispatchPolicy policy) {
        Map<String, Long> rules = Map.of(
            "offers_at_once", Long.parseLong(env("FLEET_REPLAY_OFFERS_AT_ONCE", String.valueOf(policy.offersAtOnce()))),
            "offer_rounds", Long.parseLong(env("FLEET_REPLAY_OFFER_ROUNDS", String.valueOf(policy.offerRounds()))),
            "fair_band_m", Long.parseLong(env("FLEET_REPLAY_FAIR_BAND_M", String.valueOf(policy.fairBandM()))));
        rules.forEach((rule, value) -> {
            List<Long> bounds = FleetPolicyStore.DISPATCH_RULE_BOUNDS.get(rule);
            if (value < bounds.get(0) || value > bounds.get(1)) {
                throw new IllegalArgumentException(rule + " must be " + bounds.get(0) + " to " + bounds.get(1) + " (docs/riders/REPLAY.md)");
            }
        });
        return new DispatchPolicy(policy.version(), policy.effectiveFrom(), policy.mode(), policy.offerSeconds(), policy.fleetStageSeconds(),
            policy.radiusM(), policy.pickupDetourPercent(), policy.perOrderOverheadPaise(), policy.costGuardPremiumPaise(),
            policy.pidgeStageSeconds(), rules.get("offers_at_once").intValue(), rules.get("offer_rounds").intValue(),
            rules.get("fair_band_m").intValue());
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            if (fallback == null) {
                throw new IllegalArgumentException(name + " is required (docs/riders/REPLAY.md)");
            }
            return fallback;
        }
        return value.trim();
    }
}
