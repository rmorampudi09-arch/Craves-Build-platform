package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;

/** The rider's terms (rider-v1 GET /terms) against its own database: published rows stay, so no other test sees them. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetTermsDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final UUID identity = UUID.randomUUID();
    FleetRiderService riders;

    @BeforeEach
    void setUp() {
        riders = new FleetRiderService(fleet.db, new FleetPolicyStore(fleet.db, json), FleetDatabase.properties(true), mock(FleetStorage.class));
        UUID rider = fleet.rider("Ravi Kumar", "+919876543210");
        fleet.db.update("UPDATE fleet_schema.rider SET identity_id = ?, status = 'ACTIVE', language = 'hi' WHERE id = ?", identity, rider);
    }

    @Test
    void termsShowTheNextChangeDuringItsNotice() {
        assertThat(json.valueToTree(riders.terms(identity)).has("upcoming")).as("no card is in force yet").isFalse();
        card("2026-09-v8", "-1 day", 4000, "Pilot pay.");
        card("2026-12-v3", "20 days", 5000, "Base pay goes up to ₹50.");
        card("2026-12-v2", "14 days", 4500, "Base pay goes up to ₹45.");

        JsonNode terms = json.valueToTree(riders.terms(identity));
        assertThat(terms.path("version").asText()).isEqualTo("2026-09-v8");
        assertThat(terms.path("draft").asBoolean()).isFalse();
        assertThat(terms.path("rateCardLines").path(3).path("value").asText()).isEqualTo("straight line × 1.3");
        JsonNode upcoming = terms.path("upcoming");
        assertThat(upcoming.path("version").asText()).as("the next change, not the last").isEqualTo("2026-12-v2");
        assertThat(upcoming.path("summaryOfChanges").path(0).asText()).as("English until translated").isEqualTo("Base pay goes up to ₹45.");
        assertThat(upcoming.path("rateCardLines").path(0).path("value").asText()).isEqualTo("₹45");
        assertThat(upcoming.hasNonNull("effectiveFrom")).isTrue();
        assertThatThrownBy(() -> fleet.db.update("DELETE FROM fleet_schema.rate_card WHERE version = '2026-12-v2'"))
            .as("published terms are never deleted").isInstanceOf(DataIntegrityViolationException.class);
    }

    /** A published copy of the seeded card starting at now + after; the trigger sets published_at to now. */
    private void card(String version, String after, long basePaise, String summary) {
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, status, effective_from, base_paise, base_drop_m, drop_per_km_paise, "
            + "pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, "
            + "summary_of_changes) SELECT ?, 'PUBLISHED', now() + CAST(? AS interval), ?, base_drop_m, drop_per_km_paise, pickup_free_m, "
            + "pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, "
            + "jsonb_build_object('en', jsonb_build_array(CAST(? AS text))) FROM fleet_schema.rate_card WHERE version = '2026-10-v1'",
            version, after, basePaise, summary);
    }
}
