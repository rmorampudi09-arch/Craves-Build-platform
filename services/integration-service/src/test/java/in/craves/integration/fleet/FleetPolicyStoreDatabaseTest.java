package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPolicyStoreDatabaseTest {
    FleetDatabase fleet;
    FleetPolicyStore store;

    @BeforeEach
    void setUp() {
        fleet = new FleetDatabase();
        store = new FleetPolicyStore(fleet.db, new ObjectMapper());
    }

    @Test
    void beforeAnythingIsPublishedRidersSeeTheDraftAndDispatchIsOff() {
        FleetPolicyStore.RateCard card = store.currentRateCard().orElseThrow();
        assertThat(card.version()).isEqualTo("2026-10-v1");
        assertThat(card.draft()).isTrue();
        assertThat(card.basePaise()).isEqualTo(4000);
        assertThat(card.ranges()).containsKey("base_paise");
        assertThat(card.summaryOfChanges().get("en")).isNotEmpty();
        assertThat(store.currentDispatchPolicy()).as("a draft policy never drives dispatch").isEmpty();
    }

    @Test
    void thePublishedVersionInForceWinsOverDraftsAndUpcomingVersions() {
        insertRateCard("2026-09-v1", "now() - INTERVAL '1 day'");
        insertRateCard("2026-11-v2", "now() + INTERVAL '14 days'");
        assertThat(store.currentRateCard().orElseThrow().version()).isEqualTo("2026-09-v1");

        fleet.db.update("UPDATE fleet_schema.rate_card SET effective_from = now() + INTERVAL '20 days', published_at = now() "
            + "WHERE version = '2026-09-v1'");
        assertThat(store.currentRateCard().orElseThrow().version()).as("before any is in force: the next one").isEqualTo("2026-11-v2");

        fleet.db.update("INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, "
            + "fleet_stage_seconds, radius_m, ranges) VALUES ('2026-09-v1', 'PUBLISHED', now() - INTERVAL '1 day', now() - INTERVAL '15 days', "
            + "'off', 40, 60, 5000, '{}')");
        assertThat(store.currentDispatchPolicy().orElseThrow().mode()).isEqualTo("off");
    }

    @Test
    void testModeTouchesOnlyAllowListedRidersAndKitchens() {
        FleetTestMode testMode = new FleetTestMode(fleet.db, FleetDatabase.properties(true));
        UUID listed = fleet.rider("Ravi Kumar", "+919876543210");
        UUID other = fleet.rider("Sita Devi", "+919876543211");
        UUID kitchen = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.test_mode_rider (rider_id) VALUES (?)", listed);
        fleet.db.update("INSERT INTO fleet_schema.test_mode_kitchen (chef_id) VALUES (?)", kitchen);

        assertThat(testMode.riderAllowed(listed)).isTrue();
        assertThat(testMode.riderAllowed(other)).isFalse();
        assertThat(testMode.kitchenAllowed(kitchen)).isTrue();
        assertThat(testMode.kitchenAllowed(UUID.randomUUID())).isFalse();
    }

    private void insertRateCard(String version, String effectiveFrom) {
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, status, effective_from, published_at, base_paise, base_drop_m, "
            + "drop_per_km_paise, pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, "
            + "slot_guarantee_per_hour_paise, ranges, summary_of_changes) VALUES (?, 'PUBLISHED', " + effectiveFrom + ", "
            + effectiveFrom + " - INTERVAL '14 days', 4000, 2000, 900, 1000, 900, 8, 150, 8000, '{}', '{\"en\": []}')", version);
    }
}
