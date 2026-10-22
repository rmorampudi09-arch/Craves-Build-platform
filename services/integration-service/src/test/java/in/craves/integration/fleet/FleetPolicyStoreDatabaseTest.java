package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
        assertThat(store.upcomingRateCard().orElseThrow().version()).as("riders see the change during its notice").isEqualTo("2026-11-v2");

        fleet.db.update("UPDATE fleet_schema.rate_card SET effective_from = now() + INTERVAL '20 days', published_at = now() "
            + "WHERE version = '2026-09-v1'");
        assertThat(store.currentRateCard().orElseThrow().version()).as("before any is in force: the next one").isEqualTo("2026-11-v2");
        assertThat(store.upcomingRateCard()).as("nothing is in force, so nothing changes").isEmpty();

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

    @Test
    void theFirstRateCardStartsAtOnceAndEveryLaterOneNeedsFourteenDays() {
        UUID ops = UUID.randomUUID();
        fleet.db.update("UPDATE fleet_schema.rate_card SET effective_from = now() - INTERVAL '1 day', base_paise = 7000 "
            + "WHERE version = '2026-10-v1'");
        assertThatThrownBy(() -> store.publishRateCard("2026-10-v1", ops)).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.getMessage()).isEqualTo("base_paise 7000 is outside the declared range 3000 to 6000."));

        fleet.db.update("UPDATE fleet_schema.rate_card SET base_paise = 4000 WHERE version = '2026-10-v1'");
        store.publishRateCard("2026-10-v1", ops);
        assertThat(fleet.db.queryForObject("SELECT status = 'PUBLISHED' AND effective_from = published_at AND published_at > now() - "
            + "INTERVAL '1 minute' FROM fleet_schema.rate_card WHERE version = '2026-10-v1'", Boolean.class))
            .as("a first card starting in the past starts when it is published").isTrue();
        assertThat(store.currentRateCard().orElseThrow().draft()).isFalse();
        assertThatThrownBy(() -> store.publishRateCard("2026-10-v1", ops)).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("VERSION_ALREADY_PUBLISHED"));

        draftRateCard("2026-12-v2", "now() + INTERVAL '13 days'");
        assertThatThrownBy(() -> store.publishRateCard("2026-12-v2", ops)).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.code()).isEqualTo("VERSION_REFUSED");
            assertThat(error.getMessage()).isEqualTo("It must start at least 14 days after it is published.");
        });
        fleet.db.update("UPDATE fleet_schema.rate_card SET effective_from = now() + INTERVAL '15 days' WHERE version = '2026-12-v2'");
        store.publishRateCard("2026-12-v2", ops);
        assertThat(store.upcomingRateCard().orElseThrow().version()).isEqualTo("2026-12-v2");
    }

    @Test
    void aLaterVersionCannotEscapeThePublishedRangesByDeclaringWiderOnes() {
        fleet.db.update("UPDATE fleet_schema.rate_card SET effective_from = now() + INTERVAL '15 days' WHERE version = '2026-10-v1'");
        store.publishRateCard("2026-10-v1", UUID.randomUUID());
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, effective_from, base_paise, base_drop_m, drop_per_km_paise, "
            + "pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, "
            + "summary_of_changes) SELECT '2026-12-v2', now() + INTERVAL '30 days', 2000, base_drop_m, drop_per_km_paise, pickup_free_m, "
            + "pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, "
            + "jsonb_set(ranges, '{base_paise}', '[1000, 6000]'), summary_of_changes FROM fleet_schema.rate_card WHERE version = '2026-10-v1'");
        assertThatThrownBy(() -> store.publishRateCard("2026-12-v2", UUID.randomUUID())).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.getMessage()).contains("base_paise 2000 is outside the declared range 3000 to 6000"));
    }

    @Test
    void aDispatchPolicyKeepsItsRangesStartsNowOrOnADateAtLeastFourteenDaysAwayAndGoesLiveOnlyWithARateCard() {
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET effective_from = now() + INTERVAL '15 days', offer_seconds = 20");
        assertThatThrownBy(() -> store.publishDispatchPolicy("2026-10-v1", UUID.randomUUID())).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("VERSION_REFUSED"));
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET offer_seconds = 40, mode = 'live'");
        assertThatThrownBy(() -> store.publishDispatchPolicy("2026-10-v1", UUID.randomUUID())).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("RATE_CARD_REQUIRED"));
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET mode = 'off'");
        store.publishDispatchPolicy("2026-10-v1", UUID.randomUUID());
        assertThat(store.currentDispatchPolicy()).as("published, but not in force for 15 days").isEmpty();
    }

    private void draftRateCard(String version, String effectiveFrom) {
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, effective_from, base_paise, base_drop_m, drop_per_km_paise, "
            + "pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, "
            + "summary_of_changes) SELECT ?, " + effectiveFrom + ", base_paise, base_drop_m, drop_per_km_paise, pickup_free_m, "
            + "pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, summary_of_changes "
            + "FROM fleet_schema.rate_card WHERE version = '2026-10-v1'", version);
    }

    private void insertRateCard(String version, String effectiveFrom) {
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, status, effective_from, published_at, base_paise, base_drop_m, "
            + "drop_per_km_paise, pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, "
            + "slot_guarantee_per_hour_paise, ranges, summary_of_changes) VALUES (?, 'PUBLISHED', " + effectiveFrom + ", "
            + effectiveFrom + " - INTERVAL '14 days', 4000, 2000, 900, 1000, 900, 8, 150, 8000, '{}', '{\"en\": []}')", version);
    }
}
