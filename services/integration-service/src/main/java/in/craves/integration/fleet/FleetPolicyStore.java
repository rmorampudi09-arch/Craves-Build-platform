package in.craves.integration.fleet;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads and publishes the versioned rate card and dispatch policy, so changing them needs no restart. Publishing
 * (Telangana Act 21 of 2026, s.13(2)) is refused when the version starts less than 14 days after publishing or a
 * value lies outside the declared ranges: those of the newest published version, or the version's own for the first.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetPolicyStore {
    private static final TypeReference<Map<String, List<Long>>> RANGES = new TypeReference<>() { };
    private static final TypeReference<Map<String, List<String>>> TEXT = new TypeReference<>() { };
    static final Duration NOTICE = Duration.ofDays(14);

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public FleetPolicyStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /**
     * The rate card riders see as their terms: the latest one in force; before any is in force, the next published
     * one; before anything is published, the latest draft (shown as a draft).
     */
    public Optional<RateCard> currentRateCard() {
        return jdbc.query("""
            SELECT * FROM fleet_schema.rate_card
            ORDER BY CASE WHEN status = 'PUBLISHED' AND effective_from <= now() THEN 0 WHEN status = 'PUBLISHED' THEN 1 ELSE 2 END,
                     CASE WHEN status = 'PUBLISHED' AND effective_from <= now() THEN effective_from END DESC NULLS LAST,
                     CASE WHEN status = 'PUBLISHED' THEN effective_from END ASC NULLS LAST,
                     created_at DESC
            LIMIT 1""", (row, n) -> rateCard(row)).stream().findFirst();
    }

    /** The policy in force. Empty means dispatch is off: drafts never drive dispatch. */
    public Optional<DispatchPolicy> currentDispatchPolicy() {
        return jdbc.query("""
            SELECT version, effective_from, mode, offer_seconds, fleet_stage_seconds, radius_m, pickup_detour_percent,
                   per_order_overhead_paise, cost_guard_premium_paise, pidge_stage_seconds FROM fleet_schema.dispatch_policy
            WHERE status = 'PUBLISHED' AND effective_from <= now() ORDER BY effective_from DESC LIMIT 1""",
            (row, n) -> new DispatchPolicy(row.getString("version"), row.getTimestamp("effective_from").toInstant(),
                row.getString("mode"), row.getInt("offer_seconds"), row.getInt("fleet_stage_seconds"), row.getInt("radius_m"),
                row.getInt("pickup_detour_percent"), row.getLong("per_order_overhead_paise"), row.getLong("cost_guard_premium_paise"),
                row.getInt("pidge_stage_seconds")))
            .stream().findFirst();
    }

    /** A rate card by version, for pay locked on an offer. */
    public Optional<RateCard> rateCard(String version) {
        return jdbc.query("SELECT * FROM fleet_schema.rate_card WHERE version = ?", (row, n) -> rateCard(row), version).stream().findFirst();
    }

    @Transactional
    public void publishRateCard(String version, UUID publishedBy) {
        publish("rate_card", version, publishedBy, List.of("base_paise", "base_drop_m", "drop_per_km_paise", "pickup_free_m",
            "pickup_per_km_paise", "wait_free_minutes", "wait_per_minute_paise", "slot_guarantee_per_hour_paise",
            "cancellation_fee_paise", "return_per_km_paise", "unreachable_wait_minutes"));
    }

    @Transactional
    public void publishDispatchPolicy(String version, UUID publishedBy) {
        publish("dispatch_policy", version, publishedBy, List.of("offer_seconds", "fleet_stage_seconds", "radius_m",
            "pickup_detour_percent", "per_order_overhead_paise", "cost_guard_premium_paise", "pidge_stage_seconds"));
    }

    private void publish(String table, String version, UUID publishedBy, List<String> columns) {
        Map<String, Object> row = jdbc.queryForList("SELECT *, ranges::text AS declared_ranges FROM fleet_schema." + table
            + " WHERE version = ? FOR UPDATE", version).stream().findFirst().orElseThrow(() -> FleetApiException.notFound("VERSION_NOT_FOUND", "No such version."));
        if (!"DRAFT".equals(row.get("status"))) {
            throw FleetApiException.conflict("VERSION_ALREADY_PUBLISHED", "This version is already published.");
        }
        String declared = jdbc.queryForList("SELECT ranges::text FROM fleet_schema." + table + " WHERE status = 'PUBLISHED' "
            + "ORDER BY effective_from DESC LIMIT 1", String.class).stream().findFirst().orElse((String) row.get("declared_ranges"));
        Map<String, Long> values = new LinkedHashMap<>();
        columns.forEach(column -> values.put(column, ((Number) row.get(column)).longValue()));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        List<String> problems;
        try {
            problems = publishProblems(values, json.readValue(declared, RANGES),
                ((java.sql.Timestamp) row.get("effective_from")).toInstant(), now);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Declared ranges are unreadable", exception);
        }
        if (!problems.isEmpty()) {
            throw FleetApiException.unprocessable("VERSION_REFUSED", String.join(" ", problems));
        }
        jdbc.update("UPDATE fleet_schema." + table + " SET status = 'PUBLISHED', published_at = ?, published_by = ? WHERE version = ?",
            java.sql.Timestamp.from(now), publishedBy, version);
    }

    /** Why a version may not be published now; empty when it may. */
    static List<String> publishProblems(Map<String, Long> values, Map<String, List<Long>> ranges, Instant effectiveFrom, Instant now) {
        List<String> problems = new ArrayList<>();
        if (effectiveFrom.isBefore(now.plus(NOTICE))) {
            problems.add("It must start at least 14 days after it is published.");
        }
        values.forEach((name, value) -> {
            List<Long> range = ranges.get(name);
            if (range == null || range.size() != 2) {
                problems.add(name + " has no declared range.");
            } else if (value < range.get(0) || value > range.get(1)) {
                problems.add(name + " " + value + " is outside the declared range " + range.get(0) + " to " + range.get(1) + ".");
            }
        });
        return problems;
    }

    private RateCard rateCard(ResultSet row) throws SQLException {
        try {
            return new RateCard(row.getString("version"), "DRAFT".equals(row.getString("status")),
                row.getTimestamp("effective_from").toInstant(), row.getLong("base_paise"), row.getInt("base_drop_m"),
                row.getLong("drop_per_km_paise"), row.getInt("pickup_free_m"), row.getLong("pickup_per_km_paise"),
                row.getInt("wait_free_minutes"), row.getLong("wait_per_minute_paise"), row.getLong("slot_guarantee_per_hour_paise"),
                json.readValue(row.getString("ranges"), RANGES), json.readValue(row.getString("summary_of_changes"), TEXT),
                row.getString("full_text_url"), row.getLong("cancellation_fee_paise"), row.getLong("return_per_km_paise"),
                row.getInt("unreachable_wait_minutes"));
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Rate card " + row.getString("version") + " has unreadable JSON", exception);
        }
    }

    /** cancellationFeePaise and returnPerKmPaise are the event fees; unreachableWaitMinutes the wait before the photo or "failed". */
    public record RateCard(
        String version, boolean draft, Instant effectiveFrom,
        long basePaise, int baseDropM, long dropPerKmPaise, int pickupFreeM, long pickupPerKmPaise,
        int waitFreeMinutes, long waitPerMinutePaise, long slotGuaranteePerHourPaise,
        Map<String, List<Long>> ranges, Map<String, List<String>> summaryOfChanges, String fullTextUrl,
        long cancellationFeePaise, long returnPerKmPaise, int unreachableWaitMinutes
    ) {
        /** The P1 shape, with the seeded draft's event fees. */
        public RateCard(String version, boolean draft, Instant effectiveFrom, long basePaise, int baseDropM, long dropPerKmPaise,
                        int pickupFreeM, long pickupPerKmPaise, int waitFreeMinutes, long waitPerMinutePaise,
                        long slotGuaranteePerHourPaise, Map<String, List<Long>> ranges, Map<String, List<String>> summaryOfChanges,
                        String fullTextUrl) {
            this(version, draft, effectiveFrom, basePaise, baseDropM, dropPerKmPaise, pickupFreeM, pickupPerKmPaise, waitFreeMinutes,
                waitPerMinutePaise, slotGuaranteePerHourPaise, ranges, summaryOfChanges, fullTextUrl, 2000, 900, 10);
        }
    }

    /**
     * mode is off, shadow or live; times in seconds; radius in metres. Pickup km = straight line x pickupDetourPercent / 100;
     * the cost guard compares locked pay + perOrderOverheadPaise with the courier quote + costGuardPremiumPaise. After
     * Borzo's 120-second window, Pidge has pidgeStageSeconds before the order goes to the ops queue.
     */
    public record DispatchPolicy(String version, Instant effectiveFrom, String mode, int offerSeconds, int fleetStageSeconds,
                                 int radiusM, int pickupDetourPercent, long perOrderOverheadPaise, long costGuardPremiumPaise,
                                 int pidgeStageSeconds) {
        /** The P1 shape, with the seeded draft's detour, cost-guard and Pidge stage values. */
        public DispatchPolicy(String version, Instant effectiveFrom, String mode, int offerSeconds, int fleetStageSeconds, int radiusM) {
            this(version, effectiveFrom, mode, offerSeconds, fleetStageSeconds, radiusM, 130, 500, 1000, 600);
        }
    }
}
