package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;

@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPolicyStoreDatabaseTest {
    /**
     * The dispatch_policy columns that are not rules of how orders are offered: a version's identity and lifecycle, its mode,
     * and the operations values that change at once inside their declared ranges (docs/riders/DISPATCH.md §7). The table's
     * trigger (V192) has the same list and treats every other column as a rule, so a new column needs 14 days' notice unless
     * it is named in both.
     */
    static final Set<String> NOT_RULES = Set.of("version", "status", "effective_from", "published_at", "published_by", "created_at",
        "withdrawn_at", "withdrawn_by", "mode", "ranges", "offer_seconds", "fleet_stage_seconds", "radius_m",
        "per_order_overhead_paise", "cost_guard_premium_paise", "pidge_stage_seconds");
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
        // Policy 2026-11-v2 (V184): before any policy is published, its two lines join the draft and no version is spent.
        FleetPolicyStore.DispatchRules shown = store.dispatchRules(null);
        assertThat(shown.jointMatching()).isTrue();
        assertThat(shown.nextOrderOffers()).isTrue();
        assertThat(fleet.db.queryForList("SELECT version FROM fleet_schema.dispatch_policy", String.class)).containsExactly("2026-10-v1");
    }

    @Test
    void beforeAnyCardIsInForceRidersSeeTheNextPublishedOneAndNoChange() {
        insertRateCard("2026-11-v2", "now() + INTERVAL '20 days'");
        assertThat(store.currentRateCard().orElseThrow().version()).isEqualTo("2026-11-v2");
        assertThat(store.rateCardInForce(null)).isEmpty();
        assertThat(store.nextTermsChange()).as("nothing is in force, so nothing changes").isEmpty();
    }

    @Test
    void theVersionInForceWinsAndTheNextChangeIsTheEarliestCard() {
        insertRateCard("2026-09-v1", "now() - INTERVAL '1 day'");
        insertRateCard("2026-11-v3", "now() + INTERVAL '20 days'");
        insertRateCard("2026-11-v2", "now() + INTERVAL '14 days'");
        assertThat(store.currentRateCard().orElseThrow().version()).isEqualTo("2026-09-v1");
        assertThat(store.rateCardInForce(null).orElseThrow().version()).isEqualTo("2026-09-v1");
        FleetPolicyStore.TermsChange change = store.nextTermsChange().orElseThrow();
        assertThat(change.card().version()).as("the next change, not the last").isEqualTo("2026-11-v2");
        assertThat(change.cardStarts()).isTrue();
        assertThat(change.detourBefore()).as("the seeded draft's, before any policy").isEqualTo(130).isEqualTo(change.detourAfter());

        insertPolicy("2026-09-v1", "now() - INTERVAL '1 day'", 130);
        assertThat(store.currentDispatchPolicy().orElseThrow().mode()).isEqualTo("off");
    }

    @Test
    void aScheduledDetourChangeBeforeTheNextCardIsTheNextChange() {
        insertRateCard("2026-09-v1", "now() - INTERVAL '1 day'");
        insertRateCard("2026-11-v2", "now() + INTERVAL '30 days'");
        insertPolicy("2026-10-v5", "now() + INTERVAL '5 days'", 130);
        insertPolicy("2026-10-v6", "now() + INTERVAL '15 days'", 150);
        FleetPolicyStore.TermsChange change = store.nextTermsChange().orElseThrow();
        assertThat(change.at()).as("the same detour changes nothing").isEqualTo(
            fleet.db.queryForObject("SELECT effective_from FROM fleet_schema.dispatch_policy WHERE version = '2026-10-v6'", Timestamp.class)
                .toInstant());
        assertThat(change.card().version()).as("the card in force then").isEqualTo("2026-09-v1");
        assertThat(change.cardStarts()).isFalse();
        assertThat(change.detourBefore()).isEqualTo(130);
        assertThat(change.detourAfter()).isEqualTo(150);
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
        assertThat(store.nextTermsChange().orElseThrow().card().version()).isEqualTo("2026-12-v2");
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

        fleet.db.update("UPDATE fleet_schema.rate_card SET base_paise = 4000 WHERE version = '2026-12-v2'");
        assertThat(store.publishRateCard("2026-12-v2", UUID.randomUUID())).as("its wider ranges were replaced").isTrue();
        assertThat(fleet.db.queryForObject("SELECT ranges = (SELECT ranges FROM fleet_schema.rate_card WHERE version = '2026-10-v1') "
            + "FROM fleet_schema.rate_card WHERE version = '2026-12-v2'", Boolean.class)).isTrue();
    }

    @Test
    void aDispatchPolicyKeepsItsRangesStartsNowOrOnADateAtLeastFourteenDaysAwayAndGoesLiveOnlyWithARateCard() {
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET effective_from = now() + INTERVAL '15 days', offer_seconds = 10");
        assertThatThrownBy(() -> store.publishDispatchPolicy("2026-10-v1", UUID.randomUUID())).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("VERSION_REFUSED"));
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET offer_seconds = 40, mode = 'live'");
        assertThatThrownBy(() -> store.publishDispatchPolicy("2026-10-v1", UUID.randomUUID())).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.code()).isEqualTo("RATE_CARD_REQUIRED"));
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET mode = 'off'");
        store.publishDispatchPolicy("2026-10-v1", UUID.randomUUID());
        assertThat(store.currentDispatchPolicy()).as("published, but not in force for 15 days").isEmpty();
    }

    /**
     * Read from the catalog, so a column added later is tested with no change here: once riders have terms, a version that
     * changes any rules column inside 14 days is refused by the table and by the code, and with the notice riders are shown
     * the change coming. A column the code does not carry (DispatchRules, rules(), nextTermsChange()) fails here.
     */
    @Test
    void everyRulesColumnNeedsFourteenDaysNoticeInTheTableAndInTheCode() {
        ridersHaveTerms();
        List<String> columns = fleet.db.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema = "
            + "'fleet_schema' AND table_name = 'dispatch_policy' ORDER BY ordinal_position", String.class);
        assertThat(columns).as("the list names only columns there are").containsAll(NOT_RULES);
        List<String> rules = columns.stream().filter(column -> !NOT_RULES.contains(column)).toList();
        assertThat(rules).contains("pickup_detour_percent", "offers_at_once", "offer_rounds", "fair_band_m", "rank_by_travel_time",
            "joint_matching", "next_order_offers", "ring_1_m", "ring_1_seconds", "ring_2_m", "ring_2_seconds");
        UUID ops = UUID.randomUUID();
        for (String column : rules) {
            String version = "2099-01-v" + (rules.indexOf(column) + 1);
            draft(version);
            change(version, column);
            assertThatThrownBy(() -> fleet.db.update("UPDATE fleet_schema.dispatch_policy SET status = 'PUBLISHED', published_at = now() "
                + "WHERE version = ?", version), "%s, in the table", column).isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("must start at least 14 days after it is published");
            // The pickup detour is pay, with a refusal of its own; every other rules column is how orders are offered.
            boolean detour = "pickup_detour_percent".equals(column);
            assertThatThrownBy(() -> store.publishDispatchPolicy(version, ops), "%s, in the code", column).isInstanceOfSatisfying(
                FleetApiException.class, error -> assertThat(error.code()).isEqualTo(detour ? "DETOUR_NEEDS_NOTICE" : "RULES_NEED_NOTICE"));

            fleet.db.update("UPDATE fleet_schema.dispatch_policy SET effective_from = now() + INTERVAL '15 days' WHERE version = ?", version);
            store.publishDispatchPolicy(version, ops);
            assertThat(store.nextTermsChange()).as(column + ": riders are shown the change during its notice").hasValueSatisfying(
                next -> assertThat(detour ? next.detourAfter().equals(next.detourBefore()) : next.rulesAfter().equals(next.rulesBefore()))
                    .as(column + " is among the terms riders are shown").isFalse());
            // Withdrawn, so the next column's version is the only change ahead.
            fleet.db.update("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now() WHERE version = ?", version);
        }
    }

    @Test
    void theModeAndTheOperationsValuesChangeAtOnceAndTheEmergencyStopWorks() {
        ridersHaveTerms();
        draft("2099-01-v1");
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET mode = 'shadow', offer_seconds = offer_seconds + 1, "
            + "fleet_stage_seconds = fleet_stage_seconds + 1, radius_m = radius_m + 1, per_order_overhead_paise = per_order_overhead_paise + 1, "
            + "cost_guard_premium_paise = cost_guard_premium_paise + 1, pidge_stage_seconds = pidge_stage_seconds + 1, "
            + "ranges = ranges || '{\"radius_m\": [1000, 9000]}' WHERE version = '2099-01-v1'");
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET status = 'PUBLISHED', published_at = now(), effective_from = now() "
            + "WHERE version = '2099-01-v1'");
        assertThat(store.currentDispatchPolicy().orElseThrow().version()).as("in the table").isEqualTo("2099-01-v1");

        draft("2099-01-v2");
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET offer_seconds = offer_seconds + 2, radius_m = radius_m + 2 "
            + "WHERE version = '2099-01-v2'");
        assertThat(store.publishDispatchPolicy("2099-01-v2", UUID.randomUUID())).as("the emergency stop: off, now").isEmpty();
        FleetPolicyStore.DispatchPolicy stop = store.currentDispatchPolicy().orElseThrow();
        assertThat(stop.version()).isEqualTo("2099-01-v2");
        assertThat(stop.mode()).isEqualTo("off");
    }

    /** The seeded policy in force, then a rate card in force: from here a change to riders' terms needs notice. */
    private void ridersHaveTerms() {
        fleet.db.update("UPDATE fleet_schema.dispatch_policy SET status = 'PUBLISHED', published_at = now(), effective_from = now()");
        insertRateCard("2026-09-v1", "now() - INTERVAL '1 day'");
    }

    /** A draft copy of the seeded policy, column for column, to start in 13 days. */
    private void draft(String version) {
        fleet.db.update("INSERT INTO fleet_schema.dispatch_policy SELECT (jsonb_populate_record(p, jsonb_build_object('version', "
            + "CAST(? AS text), 'status', 'DRAFT', 'published_at', NULL, 'created_at', now(), 'effective_from', now() + INTERVAL '13 days'))).* "
            + "FROM fleet_schema.dispatch_policy p WHERE version = '2026-10-v1'", version);
    }

    /** Moves a draft's column off the seeded value: a boolean flipped, a number one up, or one down where its CHECK ends. */
    private void change(String version, String column) {
        String set = "UPDATE fleet_schema.dispatch_policy SET " + column + " = ";
        Object value = fleet.db.queryForMap("SELECT * FROM fleet_schema.dispatch_policy WHERE version = ?", version).get(column);
        if (value instanceof Boolean) {
            fleet.db.update(set + "NOT " + column + " WHERE version = ?", version);
        } else if (value instanceof Number) {
            try {
                fleet.db.update(set + column + " + 1 WHERE version = ?", version);
            } catch (DataIntegrityViolationException atItsMaximum) {
                fleet.db.update(set + column + " - 1 WHERE version = ?", version);
            }
        } else {
            throw new AssertionError("dispatch_policy." + column + " is a rules column this test cannot change (" + value
                + "): teach change() its type, or, if it is not a rule, name it in NOT_RULES and in the trigger.");
        }
    }

    /** The switch off (the default): every read asks the database, so the emergency stop is seen by the very next look. */
    @Test
    void withoutTheCacheTheEmergencyStopIsSeenAtOnce() {
        insertPolicy("2026-09-v1", "now() - INTERVAL '1 day'", 130, "shadow");
        assertThat(store.currentDispatchPolicy().orElseThrow().mode()).isEqualTo("shadow");
        insertPolicy("2026-09-v2", "now()", 130, "off");
        assertThat(store.currentDispatchPolicy().orElseThrow().mode()).as("mode off, published a moment ago").isEqualTo("off");
    }

    /**
     * CRAVES_FLEET_DISPATCH_POLICY_CACHE_SECONDS: a replica goes on using the policy it last read for that long and no
     * longer, so the emergency stop (or a new version, or a withdrawal) reaches it within those seconds; never more than 5.
     */
    @Test
    void withTheCacheOnTheEmergencyStopIsSeenWithinTheCachedSeconds() throws Exception {
        insertPolicy("2026-09-v1", "now() - INTERVAL '1 day'", 130, "shadow");
        store.setDispatchPolicyCacheSeconds(1);
        assertThat(store.currentDispatchPolicy().orElseThrow().mode()).isEqualTo("shadow");
        insertPolicy("2026-09-v2", "now()", 130, "off");
        assertThat(store.currentDispatchPolicy().orElseThrow().mode()).as("within the second: the policy last read").isEqualTo("shadow");
        Thread.sleep(1_100);
        assertThat(store.currentDispatchPolicy().orElseThrow().mode()).as("after it: the stop").isEqualTo("off");

        store.setDispatchPolicyCacheSeconds(3_600);
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(store, "cacheNanos")).as("never more than 5 s")
            .isEqualTo(5_000_000_000L);
        store.setDispatchPolicyCacheSeconds(-1);
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(store, "cacheNanos")).as("a negative value is off").isEqualTo(0L);
    }

    private void draftRateCard(String version, String effectiveFrom) {
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, effective_from, base_paise, base_drop_m, drop_per_km_paise, "
            + "pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, "
            + "summary_of_changes) SELECT ?, " + effectiveFrom + ", base_paise, base_drop_m, drop_per_km_paise, pickup_free_m, "
            + "pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, summary_of_changes "
            + "FROM fleet_schema.rate_card WHERE version = '2026-10-v1'", version);
    }

    /** A published card; the trigger sets published_at to now. */
    private void insertRateCard(String version, String effectiveFrom) {
        fleet.db.update("INSERT INTO fleet_schema.rate_card (version, status, effective_from, published_at, base_paise, base_drop_m, "
            + "drop_per_km_paise, pickup_free_m, pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, "
            + "slot_guarantee_per_hour_paise, ranges, summary_of_changes) VALUES (?, 'PUBLISHED', " + effectiveFrom + ", now(), 4000, 2000, "
            + "900, 1000, 900, 8, 150, 8000, '{}', '{\"en\": []}')", version);
    }

    private void insertPolicy(String version, String effectiveFrom, int detour) {
        insertPolicy(version, effectiveFrom, detour, "off");
    }

    private void insertPolicy(String version, String effectiveFrom, int detour, String mode) {
        fleet.db.update("INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, "
            + "fleet_stage_seconds, radius_m, pickup_detour_percent, ranges, joint_matching, next_order_offers) VALUES (?, 'PUBLISHED', "
            + effectiveFrom + ", now(), ?, 40, 60, 5000, ?, '{}', true, true)", version, mode, detour);
    }
}
