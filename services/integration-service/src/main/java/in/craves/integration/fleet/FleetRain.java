package in.craves.integration.fleet;

import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.eta.FleetEta;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Rain mode (R16 19; docs/riders/DISPATCH.md, "Rain mode"), built switched off. The level is the ops switch
 * (fleet_schema.rain_mode: off, on or severe), or, with CRAVES_FLEET_RAIN_AUTO, on by itself while rides to the door run well
 * over the travel-time model's minutes. While it is on: at least 45 s to accept and at most 2 rounds
 * (FleetPolicyStore.currentDispatchPolicy), the search 5 minutes earlier (DeliveryCommandScheduler) and the rate card's rain
 * top-up on each offer (FleetPay.quote). Severe also sends new orders straight to Borzo or Pidge (FleetDispatcher.run).
 * Riders must have been told 14 days before its first use (Telangana Act 21 of 2026, s.13(2)).
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetRain {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetRain.class);
    public static final String OFF = "off";
    public static final String ON = "on";
    public static final String SEVERE = "severe";
    public static final List<String> LEVELS = List.of(OFF, ON, SEVERE);
    /** Dispatch reads the level at most this often on each server, not once per rider. */
    static final long CACHE_MS = 30_000;
    /**
     * On by itself: at least 10 rides to the door by at least 5 riders ended in the last 30 minutes, and the middle one took
     * 1.3 times its predicted minutes.
     */
    static final int AUTO_MINUTES = 30;
    static final int AUTO_RIDES = 10;
    static final int AUTO_RIDERS = 5;
    static final double AUTO_RATIO = 1.3;
    /** While on: riders get at least 45 s to accept, an order at most 2 rounds, and the search starts 5 minutes earlier. */
    static final int OFFER_SECONDS = 45;
    static final int MAX_ROUNDS = 2;
    public static final Duration EARLIER = Duration.ofMinutes(5);

    private final JdbcTemplate jdbc;
    private final FleetEta eta;
    private final boolean auto;
    private volatile Read last;

    public FleetRain(JdbcTemplate jdbc, FleetEta eta, @Value("${craves.fleet.rain-auto:false}") boolean auto) {
        this.jdbc = jdbc;
        this.eta = eta;
        this.auto = auto;
    }

    /** Rain mode is on, or severe. */
    public boolean raining() {
        return !OFF.equals(level());
    }

    public boolean severe() {
        return SEVERE.equals(level());
    }

    /** The level in force: off, on or severe. Read at most every 30 s; a read that fails keeps the last level (off before any). */
    public String level() {
        return level(System.currentTimeMillis());
    }

    /** level() at the clock's now (tests pass their own). */
    String level(long now) {
        Read seen = last;
        if (seen != null && now - seen.atMs() < CACHE_MS) {
            return seen.level();
        }
        String level = seen == null ? OFF : seen.level();
        boolean byAuto = seen != null && seen.byAuto();
        try {
            String set = setting().level();
            level = current(set);
            boolean nowByAuto = !level.equals(set);
            // Ops changes are logged as they are made (set); the automatic switch's only show here.
            if (nowByAuto != byAuto && OFF.equals(set)) {
                LOGGER.info("FLEET_RAIN_MODE level={} by=auto", level);
            }
            byAuto = nowByAuto;
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_RAIN_MODE read failed, level {} kept: {}", level, exception.getClass().getSimpleName());
        }
        last = new Read(level, byAuto, now);
        return level;
    }

    /** For the console, read now: the ops switch, whether the automatic switch is on, and the level dispatch runs on. */
    public Status status() {
        Setting setting = setting();
        return new Status(setting, auto, current(setting.level()));
    }

    /** Sets the ops switch, in the caller's transaction. This server uses it once it commits, the others within 30 s. */
    public Setting set(String level, UUID by, String byName) {
        jdbc.update("INSERT INTO fleet_schema.rain_mode (id, level, set_by, set_by_name, set_at) VALUES (true, ?, ?, ?, now()) "
            + "ON CONFLICT (id) DO UPDATE SET level = EXCLUDED.level, set_by = EXCLUDED.set_by, set_by_name = EXCLUDED.set_by_name, "
            + "set_at = EXCLUDED.set_at", level, by, byName);
        last = null;
        // A read here before the commit still sees the old level and would keep it 30 s: drop it again once committed.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    last = null;
                }
            });
        }
        LOGGER.info("FLEET_RAIN_MODE level={} by={}", level, by);
        return setting();
    }

    /** The ops switch as stored; off before anyone set it. */
    public Setting setting() {
        return jdbc.query("SELECT level, set_by_name, set_at FROM fleet_schema.rain_mode", (row, n) -> {
            Timestamp at = row.getTimestamp("set_at");
            return new Setting(row.getString("level"), row.getString("set_by_name"), at == null ? null : at.toInstant());
        }).stream().findFirst().orElse(new Setting(OFF, null, null));
    }

    /** The policy as rain mode runs it: at least 45 s to accept and at most 2 rounds; the rest as it is. */
    public static DispatchPolicy inRain(DispatchPolicy policy) {
        return new DispatchPolicy(policy.version(), policy.effectiveFrom(), policy.mode(), Math.max(policy.offerSeconds(), OFFER_SECONDS),
            policy.fleetStageSeconds(), policy.radiusM(), policy.pickupDetourPercent(), policy.perOrderOverheadPaise(),
            policy.costGuardPremiumPaise(), policy.pidgeStageSeconds(), policy.offersAtOnce(), Math.min(policy.offerRounds(), MAX_ROUNDS),
            policy.fairBandM(), policy.rankByTravelTime());
    }

    /** The ops setting; when it is off and the automatic switch is on, on while rides run slow. */
    private String current(String set) {
        return OFF.equals(set) && auto && slow() ? ON : set;
    }

    /**
     * The automatic switch's measure, only while the travel-time model is live (its minutes are the yardstick): of the rides
     * from the kitchen to the door that ended in the last 30 minutes with predicted minutes, at least 10 by at least 5
     * riders, the middle one took 1.3 times its prediction or more. The middle one, so one rider's long stop can't switch
     * rain mode on; 5 riders, since the times are their taps and a few riders' taps must not either.
     */
    boolean slow() {
        if (!"live".equals(eta.mode())) {
            return false;
        }
        Map<String, Object> rides = jdbc.queryForMap("""
            SELECT count(*) AS rides, count(DISTINCT t.rider_id) AS riders,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM t.arrived_drop_at - t.picked_up_at)
                     / 60 / o.drop_minutes) AS ratio
            FROM fleet_schema.trip t JOIN fleet_schema.trip_offer o ON o.trip_id = t.id AND o.state = 'ACCEPTED'
            WHERE t.arrived_drop_at > now() - make_interval(mins => ?) AND t.picked_up_at < t.arrived_drop_at AND o.drop_minutes > 0""",
            AUTO_MINUTES);
        Number ratio = (Number) rides.get("ratio");
        return ((Number) rides.get("rides")).longValue() >= AUTO_RIDES && ((Number) rides.get("riders")).longValue() >= AUTO_RIDERS
            && ratio != null && ratio.doubleValue() >= AUTO_RATIO;
    }

    /** The ops switch: its level, and who set it and when (null before anyone did). */
    public record Setting(String level, String setByName, Instant setAt) {
    }

    /** level: what dispatch runs on now, the setting or the automatic switch's on. */
    public record Status(Setting setting, boolean auto, String level) {
    }

    /** byAuto: the level is the automatic switch's on, not the setting. */
    private record Read(String level, boolean byAuto, long atMs) {
    }
}
