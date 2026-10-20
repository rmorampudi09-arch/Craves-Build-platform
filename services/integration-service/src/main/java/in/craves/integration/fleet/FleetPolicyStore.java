package in.craves.integration.fleet;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Reads the versioned rate card and dispatch policy, so changing them needs no restart. */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetPolicyStore {
    private static final TypeReference<Map<String, List<Long>>> RANGES = new TypeReference<>() { };
    private static final TypeReference<Map<String, List<String>>> TEXT = new TypeReference<>() { };

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
            SELECT version, effective_from, mode, offer_seconds, fleet_stage_seconds, radius_m FROM fleet_schema.dispatch_policy
            WHERE status = 'PUBLISHED' AND effective_from <= now() ORDER BY effective_from DESC LIMIT 1""",
            (row, n) -> new DispatchPolicy(row.getString("version"), row.getTimestamp("effective_from").toInstant(),
                row.getString("mode"), row.getInt("offer_seconds"), row.getInt("fleet_stage_seconds"), row.getInt("radius_m")))
            .stream().findFirst();
    }

    private RateCard rateCard(ResultSet row) throws SQLException {
        try {
            return new RateCard(row.getString("version"), "DRAFT".equals(row.getString("status")),
                row.getTimestamp("effective_from").toInstant(), row.getLong("base_paise"), row.getInt("base_drop_m"),
                row.getLong("drop_per_km_paise"), row.getInt("pickup_free_m"), row.getLong("pickup_per_km_paise"),
                row.getInt("wait_free_minutes"), row.getLong("wait_per_minute_paise"), row.getLong("slot_guarantee_per_hour_paise"),
                json.readValue(row.getString("ranges"), RANGES), json.readValue(row.getString("summary_of_changes"), TEXT),
                row.getString("full_text_url"));
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Rate card " + row.getString("version") + " has unreadable JSON", exception);
        }
    }

    public record RateCard(
        String version, boolean draft, Instant effectiveFrom,
        long basePaise, int baseDropM, long dropPerKmPaise, int pickupFreeM, long pickupPerKmPaise,
        int waitFreeMinutes, long waitPerMinutePaise, long slotGuaranteePerHourPaise,
        Map<String, List<Long>> ranges, Map<String, List<String>> summaryOfChanges, String fullTextUrl
    ) {
    }

    /** mode is off, shadow or live; times in seconds; radius in metres. */
    public record DispatchPolicy(String version, Instant effectiveFrom, String mode, int offerSeconds, int fleetStageSeconds,
                                 int radiusM) {
    }
}
