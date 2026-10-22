package in.craves.integration.fleet;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
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
 * Reads and publishes the versioned rate card and dispatch policy, so changing them needs no restart. Telangana Act 21 of
 * 2026, s.13(2) asks for 14 days' notice of changed terms: every rate card after the first, and a dispatch policy that
 * changes the pickup detour. Values must lie inside the declared ranges: those of the newest published version, or the
 * version's own for the first.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetPolicyStore {
    private static final TypeReference<Map<String, List<Long>>> RANGES = new TypeReference<>() { };
    private static final TypeReference<Map<String, List<String>>> TEXT = new TypeReference<>() { };
    static final Duration NOTICE = Duration.ofDays(14);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    public static final String RATE_CARD = "rate_card";
    public static final String DISPATCH_POLICY = "dispatch_policy";
    /** The value columns of each table, as its declared ranges name them. */
    public static final List<String> RATE_CARD_FIELDS = List.of("base_paise", "base_drop_m", "drop_per_km_paise", "pickup_free_m",
        "pickup_per_km_paise", "wait_free_minutes", "wait_per_minute_paise", "slot_guarantee_per_hour_paise", "cancellation_fee_paise",
        "return_per_km_paise", "unreachable_wait_minutes");
    public static final List<String> DISPATCH_POLICY_FIELDS = List.of("offer_seconds", "fleet_stage_seconds", "radius_m",
        "pickup_detour_percent", "per_order_overhead_paise", "cost_guard_premium_paise", "pidge_stage_seconds");

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

    /** The policy in force. Empty means dispatch is off: drafts and withdrawn versions never drive dispatch. */
    public Optional<DispatchPolicy> currentDispatchPolicy() {
        return jdbc.query("""
            SELECT version, effective_from, mode, offer_seconds, fleet_stage_seconds, radius_m, pickup_detour_percent,
                   per_order_overhead_paise, cost_guard_premium_paise, pidge_stage_seconds FROM fleet_schema.dispatch_policy
            WHERE status = 'PUBLISHED' AND withdrawn_at IS NULL AND effective_from <= now()
            ORDER BY effective_from DESC, created_at DESC LIMIT 1""",
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

    /** The published rate card in force at that time (null: now, by the database clock): the one that pays. */
    public Optional<RateCard> rateCardInForce(Instant at) {
        return jdbc.query("SELECT * FROM fleet_schema.rate_card WHERE status = 'PUBLISHED' AND effective_from <= COALESCE(CAST(? AS "
            + "timestamptz), now()) ORDER BY effective_from DESC, created_at DESC LIMIT 1", (row, n) -> rateCard(row), timestamp(at))
            .stream().findFirst();
    }

    /**
     * The dispatch policy whose pickup detour riders are shown at that time (null: now): the one in force, not withdrawn;
     * before any, the newest draft. except leaves out the version being published.
     */
    public Optional<Map<String, Object>> shownDispatchPolicy(Instant at, String except) {
        return jdbc.queryForList("""
            SELECT * FROM fleet_schema.dispatch_policy WHERE version <> ? AND (status = 'DRAFT'
              OR status = 'PUBLISHED' AND withdrawn_at IS NULL AND effective_from <= COALESCE(CAST(? AS timestamptz), now()))
            ORDER BY (status = 'PUBLISHED') DESC, CASE WHEN status = 'PUBLISHED' THEN effective_from END DESC, created_at DESC
            LIMIT 1""", except, timestamp(at)).stream().findFirst();
    }

    /** The pickup detour (percent) riders are shown at that time (null: now); null when there is no dispatch policy at all. */
    public Integer pickupDetour(Instant at) {
        return shownDispatchPolicy(at, "").map(policy -> ((Number) policy.get("pickup_detour_percent")).intValue()).orElse(null);
    }

    /**
     * The next change to riders' pay terms, while a rate card is in force: the earlier of the next published rate card and
     * the next dispatch policy (not withdrawn) whose pickup detour differs from the one riders are shown now.
     */
    public Optional<TermsChange> nextTermsChange() {
        Instant now = databaseNow();
        if (rateCardInForce(now).isEmpty()) {
            return Optional.empty();
        }
        Integer detour = pickupDetour(now);
        List<Timestamp> starts = new ArrayList<>(jdbc.queryForList("SELECT effective_from FROM fleet_schema.rate_card "
            + "WHERE status = 'PUBLISHED' AND effective_from > ? ORDER BY effective_from, created_at DESC LIMIT 1", Timestamp.class,
            Timestamp.from(now)));
        if (detour != null) {
            starts.addAll(jdbc.queryForList("SELECT effective_from FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED' "
                + "AND withdrawn_at IS NULL AND effective_from > ? AND pickup_detour_percent <> ? ORDER BY effective_from LIMIT 1",
                Timestamp.class, Timestamp.from(now), detour));
        }
        return starts.stream().map(Timestamp::toInstant).min(Comparator.naturalOrder()).map(at -> {
            RateCard card = rateCardInForce(at).orElseThrow();
            return new TermsChange(at, card, card.effectiveFrom().equals(at), detour, pickupDetour(at));
        });
    }

    /**
     * Publishes a draft rate card. The first card ever may start at once (one starting in the past starts now); every later
     * one needs 14 days' notice and keeps the published card's declared ranges. The table's trigger holds the notice rule.
     * True when the draft's own ranges differed and were replaced.
     */
    @Transactional
    public boolean publishRateCard(String version, UUID publishedBy) {
        Map<String, Object> row = draft(RATE_CARD, version);
        boolean first = !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rate_card "
            + "WHERE status = 'PUBLISHED' AND version <> ?)", Boolean.class, version));
        Instant now = databaseNow();
        Instant effectiveFrom = ((Timestamp) row.get("effective_from")).toInstant();
        boolean atOnce = first && effectiveFrom.isBefore(now);
        Map<String, List<Long>> own = ranges((String) row.get("declared_ranges"));
        Map<String, List<Long>> declared = publishedRanges(RATE_CARD).orElse(own);
        refuse(publishProblems(values(row, RATE_CARD_FIELDS), declared, atOnce ? now : effectiveFrom, now, !first));
        published(RATE_CARD, version, publishedBy, atOnce ? null : effectiveFrom, declared);
        return !declared.equals(own);
    }

    /**
     * Publishes a draft dispatch policy. It starts now, or on its effective_from when that is at least 14 days away; live
     * needs a rate card in force. Once a rate card is published, a pickup detour other than the one riders are shown changes
     * their pay, so it needs that notice. The table's trigger holds the notice rule. An off that starts now is the emergency
     * stop: it withdraws every version scheduled for later, so none switches dispatch back on. Returns those, as
     * "version scheduled for time".
     */
    @Transactional
    public List<String> publishDispatchPolicy(String version, UUID publishedBy) {
        Map<String, Object> row = draft(DISPATCH_POLICY, version);
        Instant now = databaseNow();
        Instant requested = ((Timestamp) row.get("effective_from")).toInstant();
        boolean scheduled = !requested.isBefore(now.plus(NOTICE));
        if ("live".equals(row.get("mode")) && rateCardInForce(now).isEmpty()) {
            throw FleetApiException.unprocessable("RATE_CARD_REQUIRED", "Publish a rate card before switching dispatch to live.");
        }
        Integer shown = shownDispatchPolicy(now, version).map(policy -> ((Number) policy.get("pickup_detour_percent")).intValue())
            .orElse(null);
        if (!scheduled && shown != null && shown != ((Number) row.get("pickup_detour_percent")).intValue()
            && Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.rate_card WHERE status = 'PUBLISHED')",
                Boolean.class))) {
            throw FleetApiException.unprocessable("DETOUR_NEEDS_NOTICE", "A new pickup detour changes rider pay, so it needs 14 days' "
                + "notice. Choose a start at least 14 days from now.");
        }
        Map<String, List<Long>> declared = publishedRanges(DISPATCH_POLICY).orElseGet(() -> ranges((String) row.get("declared_ranges")));
        refuse(publishProblems(values(row, DISPATCH_POLICY_FIELDS), declared, scheduled ? requested : now, now, false));
        published(DISPATCH_POLICY, version, publishedBy, scheduled ? requested : null, declared);
        if (scheduled || !"off".equals(row.get("mode"))) {
            return List.of();
        }
        return jdbc.query("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now(), withdrawn_by = ? WHERE status = 'PUBLISHED' "
            + "AND withdrawn_at IS NULL AND effective_from > now() RETURNING version, effective_from",
            (withdrawn, n) -> withdrawn.getString("version") + " scheduled for " + withdrawn.getTimestamp("effective_from").toInstant(),
            publishedBy);
    }

    /**
     * The next version name in table (RATE_CARD or DISPATCH_POLICY): YYYY-MM-vN for the IST month now, N one above the
     * highest used. Takes the publish lock, so two drafts made at once cannot get the same name.
     */
    public String nextVersion(String table) {
        lock(table);
        String prefix = YearMonth.now(IST).toString();
        int last = jdbc.queryForObject("SELECT COALESCE(max(substring(version FROM '-v([0-9]+)$')::int), 0) FROM fleet_schema." + table
            + " WHERE version LIKE ?", Integer.class, prefix + "-v%");
        return prefix + "-v" + (last + 1);
    }

    /** The declared ranges of the newest published version in table (a withdrawn policy does not count), if any. */
    public Optional<Map<String, List<Long>>> publishedRanges(String table) {
        return jdbc.queryForList("SELECT ranges::text FROM fleet_schema." + table + " WHERE status = 'PUBLISHED' "
            + (DISPATCH_POLICY.equals(table) ? "AND withdrawn_at IS NULL " : "") + "ORDER BY effective_from DESC, created_at DESC LIMIT 1",
            String.class)
            .stream().findFirst().map(this::ranges);
    }

    /** The database clock (the transaction's start): the clock of published_at, the triggers and every in-force read. */
    public Instant databaseNow() {
        return jdbc.queryForObject("SELECT now()", Timestamp.class).toInstant();
    }

    /** Takes the row lock of a draft, after the publish lock; 404 or 409 otherwise. */
    private Map<String, Object> draft(String table, String version) {
        lock(table);
        Map<String, Object> row = jdbc.queryForList("SELECT *, ranges::text AS declared_ranges FROM fleet_schema." + table
            + " WHERE version = ? FOR UPDATE", version).stream().findFirst().orElseThrow(() -> FleetApiException.notFound("VERSION_NOT_FOUND", "No such version."));
        if (!"DRAFT".equals(row.get("status"))) {
            throw FleetApiException.conflict("VERSION_ALREADY_PUBLISHED", "This version is already published.");
        }
        return row;
    }

    /** One publish at a time per table: the triggers in V159 take the same lock. */
    private void lock(String table) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", rs -> null, "fleet-publish/" + table);
    }

    /** published_at is the database clock (the trigger sets it too); effectiveFrom null means now. */
    private void published(String table, String version, UUID publishedBy, Instant effectiveFrom, Map<String, List<Long>> ranges) {
        try {
            jdbc.update("UPDATE fleet_schema." + table + " SET status = 'PUBLISHED', published_at = now(), published_by = ?, "
                + "effective_from = COALESCE(CAST(? AS timestamptz), now()), ranges = CAST(? AS jsonb) WHERE version = ?", publishedBy,
                timestamp(effectiveFrom), json.writeValueAsString(ranges), version);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Declared ranges could not be written", exception);
        }
    }

    private static Timestamp timestamp(Instant at) {
        return at == null ? null : Timestamp.from(at);
    }

    private static Map<String, Long> values(Map<String, Object> row, List<String> columns) {
        Map<String, Long> values = new LinkedHashMap<>();
        columns.forEach(column -> values.put(column, ((Number) row.get(column)).longValue()));
        return values;
    }

    /** 422 VERSION_REFUSED with the problems, if any. */
    public static void refuse(List<String> problems) {
        if (!problems.isEmpty()) {
            throw FleetApiException.unprocessable("VERSION_REFUSED", String.join(" ", problems));
        }
    }

    private Map<String, List<Long>> ranges(String text) {
        try {
            return json.readValue(text, RANGES);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Declared ranges are unreadable", exception);
        }
    }

    /** Why a version may not be published now; empty when it may. notice: it must start at least 14 days after now. */
    public static List<String> publishProblems(Map<String, Long> values, Map<String, List<Long>> ranges, Instant effectiveFrom, Instant now,
                                               boolean notice) {
        List<String> problems = new ArrayList<>();
        if (notice && effectiveFrom.isBefore(now.plus(NOTICE))) {
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

    /**
     * A change to riders' terms at at: the rate card in force then (cardStarts when it starts then) and the pickup detour
     * riders are shown before and after it.
     */
    public record TermsChange(Instant at, RateCard card, boolean cardStarts, Integer detourBefore, Integer detourAfter) {
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
