package in.craves.integration.fleet.admin;

import static in.craves.integration.fleet.FleetPolicyStore.DISPATCH_POLICY;
import static in.craves.integration.fleet.FleetPolicyStore.DISPATCH_POLICY_FIELDS;
import static in.craves.integration.fleet.FleetPolicyStore.RATE_CARD;
import static in.craves.integration.fleet.FleetPolicyStore.RATE_CARD_FIELDS;
import static in.craves.integration.fleet.admin.FleetAdminService.instant;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.DispatchPolicyInput;
import in.craves.integration.fleet.admin.FleetAdminModels.DispatchPolicyVersion;
import in.craves.integration.fleet.admin.FleetAdminModels.FleetSetup;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotKitchen;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotNote;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotRider;
import in.craves.integration.fleet.admin.FleetAdminModels.RateCardDraft;
import in.craves.integration.fleet.admin.FleetAdminModels.RateCardVersion;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import java.net.URI;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The pilot zone from the console: rate cards, the dispatch mode and the test-mode allow-lists (which riders and kitchens
 * dispatch may touch while CRAVES_FLEET_TEST_MODE is on). FleetPolicyStore holds the publishing rules; every change is
 * audited through FleetAdminService.once.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetSetupService {
    private static final TypeReference<Map<String, List<Long>>> RANGES = new TypeReference<>() { };
    private static final TypeReference<Map<String, List<String>>> TEXT = new TypeReference<>() { };
    private static final Set<String> MODES = Set.of("off", "shadow", "live");
    private static final List<String> LANGUAGES = List.of("en", "te", "hi");
    private static final String IN_FORCE = "WHERE status = 'PUBLISHED' AND effective_from <= now() ORDER BY effective_from DESC LIMIT 1";
    private static final String NEWEST = "ORDER BY created_at DESC, version DESC LIMIT 20";
    private static final String PILOT_RIDER = "SELECT t.rider_id, r.name, r.status, t.note, t.added_at FROM fleet_schema.test_mode_rider t "
        + "JOIN fleet_schema.rider r ON r.id = t.rider_id ";

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final FleetPolicyStore policies;
    private final FleetAdminService admin;
    private final boolean testMode;

    public FleetSetupService(JdbcTemplate jdbc, ObjectMapper json, FleetPolicyStore policies, FleetAdminService admin,
                             FleetProperties properties) {
        this.jdbc = jdbc;
        this.json = json;
        this.policies = policies;
        this.admin = admin;
        this.testMode = properties.testMode();
    }

    @Transactional(readOnly = true)
    public FleetSetup setup() {
        return new FleetSetup(testMode,
            jdbc.query("SELECT * FROM fleet_schema.dispatch_policy " + IN_FORCE, (row, n) -> dispatchPolicy(row)).stream().findFirst().orElse(null),
            jdbc.query("SELECT * FROM fleet_schema.dispatch_policy " + NEWEST, (row, n) -> dispatchPolicy(row)),
            jdbc.query("SELECT * FROM fleet_schema.rate_card " + IN_FORCE, (row, n) -> rateCard(row)).stream().findFirst().orElse(null),
            jdbc.query("SELECT * FROM fleet_schema.rate_card " + NEWEST, (row, n) -> rateCard(row)),
            jdbc.query(PILOT_RIDER + "ORDER BY t.added_at DESC, t.rider_id LIMIT 500", (row, n) -> pilotRider(row)),
            jdbc.query("SELECT chef_id, note, added_at FROM fleet_schema.test_mode_kitchen ORDER BY added_at DESC, chef_id LIMIT 500",
                (row, n) -> new PilotKitchen(row.getObject("chef_id", UUID.class), row.getString("note"), instant(row, "added_at"))));
    }

    /** A DRAFT rate card named YYYY-MM-vN. Its values must lie inside the published ranges, or its own for the first card. */
    @Transactional
    public Object createRateCardDraft(Admin by, UUID key, RateCardDraft input) {
        if (input == null) {
            throw FleetApiException.invalid("Fill in every pay value, the start and the summary of changes.");
        }
        List<Number> given = Arrays.asList(input.basePaise(), input.baseDropM(), input.dropPerKmPaise(), input.pickupFreeM(),
            input.pickupPerKmPaise(), input.waitFreeMinutes(), input.waitPerMinutePaise(), input.slotGuaranteePerHourPaise(),
            input.cancellationFeePaise(), input.returnPerKmPaise(), input.unreachableWaitMinutes());
        if (given.stream().anyMatch(value -> value == null || value.longValue() < 0)) {
            throw FleetApiException.invalid("Fill in every pay value as a whole number of 0 or more.");
        }
        if (input.unreachableWaitMinutes() < 1 || input.unreachableWaitMinutes() > 60) {
            throw FleetApiException.invalid("Set the wait for an unreachable customer to 1 to 60 minutes.");
        }
        if (input.effectiveFrom() == null) {
            throw FleetApiException.invalid("Choose when the rate card starts.");
        }
        Map<String, List<String>> summary = summary(input.summaryOfChanges());
        String url = fullTextUrl(input.fullTextUrl());
        Map<String, Long> values = new LinkedHashMap<>();
        for (int i = 0; i < RATE_CARD_FIELDS.size(); i++) {
            values.put(RATE_CARD_FIELDS.get(i), given.get(i).longValue());
        }
        Instant effectiveFrom = input.effectiveFrom().truncatedTo(ChronoUnit.MICROS);
        return admin.once(by, key, "RATE_CARD_DRAFTED", admin.write(input), () -> {
            String version = policies.nextVersion(RATE_CARD);
            Map<String, List<Long>> ranges = policies.publishedRanges(RATE_CARD).map(published -> {
                if (input.ranges() != null && !input.ranges().equals(camel(published))) {
                    throw FleetApiException.unprocessable("RANGES_LOCKED", "The declared ranges are fixed once a rate card is published. "
                        + "Leave them out.");
                }
                return published;
            }).orElseGet(() -> firstRanges(input.ranges()));
            FleetPolicyStore.refuse(FleetPolicyStore.publishProblems(values, ranges, effectiveFrom, Instant.now(), false));
            List<Object> args = new ArrayList<>(List.of(version, Timestamp.from(effectiveFrom)));
            args.addAll(given);
            args.addAll(Arrays.asList(admin.write(ranges), admin.write(summary), url));
            jdbc.update("INSERT INTO fleet_schema.rate_card (version, effective_from, " + String.join(", ", RATE_CARD_FIELDS)
                + ", ranges, summary_of_changes, full_text_url) VALUES (?, ?, " + "?, ".repeat(RATE_CARD_FIELDS.size())
                + "CAST(? AS jsonb), CAST(? AS jsonb), ?)", args.toArray());
            return new Done(rateCard(version), null, version, "Drafted rate card " + version + ", to start " + effectiveFrom + ".");
        });
    }

    @Transactional
    public Object publishRateCard(Admin by, UUID key, String version) {
        return admin.once(by, key, "RATE_CARD_PUBLISHED", version, () -> {
            policies.publishRateCard(version, by.id());
            RateCardVersion card = rateCard(version);
            return new Done(card, null, version, "Published rate card " + version + ", in force from " + card.effectiveFrom() + ".");
        });
    }

    /** Creates and publishes a dispatch policy version in one transaction (FleetPolicyStore.publishDispatchPolicy has the rules). */
    @Transactional
    public Object setDispatchPolicy(Admin by, UUID key, DispatchPolicyInput input) {
        if (input == null || !MODES.contains(input.mode())) {
            throw FleetApiException.invalid("Choose off, shadow or live.");
        }
        List<Number> given = Arrays.asList(input.offerSeconds(), input.fleetStageSeconds(), input.radiusM(), input.pickupDetourPercent(),
            input.perOrderOverheadPaise(), input.costGuardPremiumPaise(), input.pidgeStageSeconds());
        if (given.contains(null)) {
            throw FleetApiException.invalid("Fill in every dispatch value.");
        }
        Map<String, Long> values = new LinkedHashMap<>();
        for (int i = 0; i < DISPATCH_POLICY_FIELDS.size(); i++) {
            values.put(DISPATCH_POLICY_FIELDS.get(i), given.get(i).longValue());
        }
        return admin.once(by, key, "DISPATCH_POLICY_SET", admin.write(input), () -> {
            String version = policies.nextVersion(DISPATCH_POLICY);
            // Before any policy is published, the seeded draft's ranges are the declared ones.
            Map<String, List<Long>> ranges = policies.publishedRanges(DISPATCH_POLICY).orElseGet(() -> jdbc.queryForList(
                "SELECT ranges::text FROM fleet_schema.dispatch_policy WHERE status = 'DRAFT' ORDER BY created_at DESC LIMIT 1", String.class)
                .stream().findFirst().map(text -> read(text, RANGES)).orElse(Map.of()));
            Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
            // Checked before the insert so a value the table's CHECKs refuse is a 422, not a database error.
            FleetPolicyStore.refuse(FleetPolicyStore.publishProblems(values, ranges, now, now, false));
            Instant requested = input.effectiveFrom() == null ? now : input.effectiveFrom().truncatedTo(ChronoUnit.MICROS);
            List<Object> args = new ArrayList<>(List.of(version, Timestamp.from(requested), input.mode()));
            args.addAll(given);
            args.add(admin.write(ranges));
            jdbc.update("INSERT INTO fleet_schema.dispatch_policy (version, effective_from, mode, " + String.join(", ", DISPATCH_POLICY_FIELDS)
                + ", ranges) VALUES (?, ?, ?, " + "?, ".repeat(DISPATCH_POLICY_FIELDS.size()) + "CAST(? AS jsonb))", args.toArray());
            policies.publishDispatchPolicy(version, by.id());
            DispatchPolicyVersion policy = jdbc.queryForObject("SELECT * FROM fleet_schema.dispatch_policy WHERE version = ?",
                (row, n) -> dispatchPolicy(row), version);
            return new Done(policy, null, version, "Set dispatch to " + input.mode() + " (version " + version + "), in force from "
                + policy.effectiveFrom() + ".");
        });
    }

    /** Adds the rider to the test-mode allow-list; adding again only changes the note. */
    @Transactional
    public Object addPilotRider(Admin by, UUID key, UUID riderId, PilotNote body) {
        String note = note(body);
        return admin.once(by, key, "PILOT_RIDER_ADDED", riderId + "\n" + note, () -> {
            String name = riderName(riderId);
            if (name == null) {
                throw FleetApiException.notFound("RIDER_NOT_FOUND", "No such rider.");
            }
            jdbc.update("INSERT INTO fleet_schema.test_mode_rider (rider_id, note) VALUES (?, ?) "
                + "ON CONFLICT (rider_id) DO UPDATE SET note = EXCLUDED.note", riderId, note);
            PilotRider rider = jdbc.queryForObject(PILOT_RIDER + "WHERE t.rider_id = ?", (row, n) -> pilotRider(row), riderId);
            return new Done(rider, riderId, riderId.toString(), "Added " + name + " to the pilot riders" + (note == null ? "." : ": " + note));
        });
    }

    @Transactional
    public void removePilotRider(Admin by, UUID key, UUID riderId) {
        admin.once(by, key, "PILOT_RIDER_REMOVED", riderId.toString(), () -> {
            String name = riderName(riderId);
            int removed = jdbc.update("DELETE FROM fleet_schema.test_mode_rider WHERE rider_id = ?", riderId);
            // admin_audit.rider_id references rider: an unknown id is kept as the target only.
            return new Done(null, name == null ? null : riderId, riderId.toString(), removed == 0
                ? "Removed rider " + riderId + " from the pilot riders; they were not listed." : "Removed " + name + " from the pilot riders.");
        });
    }

    /** Adds the chef's kitchen to the test-mode allow-list; adding again only changes the note. */
    @Transactional
    public Object addPilotKitchen(Admin by, UUID key, UUID chefId, PilotNote body) {
        String note = note(body);
        return admin.once(by, key, "PILOT_KITCHEN_ADDED", chefId + "\n" + note, () -> {
            PilotKitchen kitchen = jdbc.queryForObject("INSERT INTO fleet_schema.test_mode_kitchen (chef_id, note) VALUES (?, ?) "
                + "ON CONFLICT (chef_id) DO UPDATE SET note = EXCLUDED.note RETURNING chef_id, note, added_at",
                (row, n) -> new PilotKitchen(row.getObject("chef_id", UUID.class), row.getString("note"), instant(row, "added_at")), chefId, note);
            return new Done(kitchen, null, chefId.toString(), "Added kitchen " + chefId + " to the pilot kitchens"
                + (note == null ? "." : ": " + note));
        });
    }

    @Transactional
    public void removePilotKitchen(Admin by, UUID key, UUID chefId) {
        admin.once(by, key, "PILOT_KITCHEN_REMOVED", chefId.toString(), () -> new Done(null, null, chefId.toString(),
            jdbc.update("DELETE FROM fleet_schema.test_mode_kitchen WHERE chef_id = ?", chefId) == 0
                ? "Removed kitchen " + chefId + " from the pilot kitchens; it was not listed." : "Removed kitchen " + chefId + " from the pilot kitchens."));
    }

    /** base_drop_m is baseDropM: the API names of the stored columns. */
    static String camel(String column) {
        StringBuilder name = new StringBuilder();
        for (String part : column.split("_")) {
            name.append(name.isEmpty() ? part : Character.toUpperCase(part.charAt(0)) + part.substring(1));
        }
        return name.toString();
    }

    static Map<String, List<Long>> camel(Map<String, List<Long>> ranges) {
        Map<String, List<Long>> named = new LinkedHashMap<>();
        ranges.forEach((column, range) -> named.put(camel(column), range));
        return named;
    }

    /** The first card declares a [min, max] for each of its 11 values, stored under the column names. */
    private static Map<String, List<Long>> firstRanges(Map<String, List<Long>> given) {
        Set<String> names = RATE_CARD_FIELDS.stream().map(FleetSetupService::camel).collect(Collectors.toSet());
        if (given == null || !given.keySet().equals(names) || given.values().stream().anyMatch(range -> range == null || range.size() != 2
            || range.contains(null) || range.get(0) < 0 || range.get(0) > range.get(1))) {
            throw FleetApiException.invalid("The first rate card declares a range [min, max] for each of its 11 values, with 0 <= min <= max.");
        }
        Map<String, List<Long>> ranges = new LinkedHashMap<>();
        RATE_CARD_FIELDS.forEach(column -> ranges.put(column, given.get(camel(column))));
        return ranges;
    }

    /** en is required; te and hi are optional. Each has 1 to 10 lines of 1 to 200 characters. */
    static Map<String, List<String>> summary(Map<String, List<String>> given) {
        if (given == null || given.get("en") == null || !LANGUAGES.containsAll(given.keySet())) {
            throw FleetApiException.invalid("Write the summary of changes in English (en); Telugu (te) and Hindi (hi) are optional.");
        }
        Map<String, List<String>> summary = new LinkedHashMap<>();
        for (String language : LANGUAGES) {
            List<String> lines = given.get(language);
            if (lines == null) {
                continue;
            }
            List<String> trimmed = lines.stream().map(line -> line == null ? "" : line.trim()).toList();
            if (trimmed.isEmpty() || trimmed.size() > 10 || trimmed.stream().anyMatch(line -> line.isEmpty() || line.length() > 200)) {
                throw FleetApiException.invalid("Write the summary of changes in 1 to 10 lines of up to 200 characters each.");
            }
            summary.put(language, trimmed);
        }
        return summary;
    }

    static String fullTextUrl(String given) {
        if (given == null || given.isBlank()) {
            return null;
        }
        String url = given.trim();
        try {
            URI uri = URI.create(url);
            if (url.length() <= 400 && "https".equals(uri.getScheme()) && uri.getHost() != null) {
                return url;
            }
        } catch (IllegalArgumentException exception) {
            // refused below
        }
        throw FleetApiException.invalid("Link the full terms with an https address of up to 400 characters.");
    }

    static String note(PilotNote body) {
        String note = body == null || body.note() == null ? "" : body.note().trim();
        if (note.length() > 200) {
            throw FleetApiException.invalid("Write a note of up to 200 characters.");
        }
        return note.isEmpty() ? null : note;
    }

    private String riderName(UUID riderId) {
        return jdbc.queryForList("SELECT name FROM fleet_schema.rider WHERE id = ?", String.class, riderId).stream().findFirst().orElse(null);
    }

    private RateCardVersion rateCard(String version) {
        return jdbc.queryForObject("SELECT * FROM fleet_schema.rate_card WHERE version = ?", (row, n) -> rateCard(row), version);
    }

    private RateCardVersion rateCard(ResultSet row) throws SQLException {
        return new RateCardVersion(row.getString("version"), row.getString("status"), instant(row, "effective_from"),
            instant(row, "published_at"), row.getLong("base_paise"), row.getInt("base_drop_m"), row.getLong("drop_per_km_paise"),
            row.getInt("pickup_free_m"), row.getLong("pickup_per_km_paise"), row.getInt("wait_free_minutes"),
            row.getLong("wait_per_minute_paise"), row.getLong("slot_guarantee_per_hour_paise"), row.getLong("cancellation_fee_paise"),
            row.getLong("return_per_km_paise"), row.getInt("unreachable_wait_minutes"), camel(read(row.getString("ranges"), RANGES)),
            read(row.getString("summary_of_changes"), TEXT), row.getString("full_text_url"));
    }

    private DispatchPolicyVersion dispatchPolicy(ResultSet row) throws SQLException {
        return new DispatchPolicyVersion(row.getString("version"), row.getString("status"), instant(row, "effective_from"),
            instant(row, "published_at"), row.getString("mode"), row.getInt("offer_seconds"), row.getInt("fleet_stage_seconds"),
            row.getInt("radius_m"), row.getInt("pickup_detour_percent"), row.getLong("per_order_overhead_paise"),
            row.getLong("cost_guard_premium_paise"), row.getInt("pidge_stage_seconds"), camel(read(row.getString("ranges"), RANGES)));
    }

    private static PilotRider pilotRider(ResultSet row) throws SQLException {
        return new PilotRider(row.getObject("rider_id", UUID.class), row.getString("name"), row.getString("status"), row.getString("note"),
            instant(row, "added_at"));
    }

    private <T> T read(String text, TypeReference<T> type) {
        try {
            return json.readValue(text, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored fleet policy JSON is unreadable", exception);
        }
    }
}
