package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetPolicyStore.DispatchRules;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * V187 starts the policy in force again with the owner's rule of 11 Nov 2026 (20 s each, one rider at a time, no limit on
 * rounds, 300 s before Borzo), in the mode it has, and every later change still needs its notice (a disposable Postgres, as
 * FleetDatabase).
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetRidersFirstMigrationDatabaseTest {
    /** Versions are named for the IST month, as FleetPolicyStore.nextVersion names them. */
    final String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
    DataSource dataSource;
    JdbcTemplate db;
    FleetPolicyStore store;

    @BeforeEach
    void freshDatabase() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertThat(url).matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test");
        assertThat(System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE")).isEqualTo("true");
        dataSource = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        db = new JdbcTemplate(dataSource);
        db.execute("DROP SCHEMA IF EXISTS fleet_schema CASCADE");
        db.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        db.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        store = new FleetPolicyStore(db, JsonMapper.builder().findAndAddModules().build());
    }

    @Test
    void theLivePolicyStartsAgainWithTheRuleAndEveryLaterChangeStillNeedsNotice() {
        migrateTo("186");
        // Production on 11 Nov 2026: v3 live for three days (30 s, 120 s, one rider at a time, 3 rounds, 1.5 km), and a rate
        // card in force, so riders have terms. Here ops also scheduled a version with the old rules for later.
        policy(month + "-v3", "now() - INTERVAL '3 days'", "live", 30, 120, 1, 3, 1500);
        policy(month + "-v7", "now() + INTERVAL '20 days'", "shadow", 30, 120, 3, 1, 0);
        db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now(), effective_from = now() - INTERVAL '1 day' "
            + "WHERE version = '2026-10-v1'");

        migrateTo("187");

        assertThat(db.queryForMap("SELECT status, mode, offer_seconds, fleet_stage_seconds, offers_at_once, offer_rounds, fair_band_m, radius_m, "
            + "published_by, withdrawn_at, effective_from = published_at AS at_once, ranges ->> 'offer_seconds' AS offer_range, "
            + "ranges ->> 'fleet_stage_seconds' AS stage_range, ranges ->> 'radius_m' AS radius_range FROM fleet_schema.dispatch_policy "
            + "WHERE version = ?", month + "-v8")).as("one above the highest version of the month, published by no one, in force at once")
            .containsEntry("status", "PUBLISHED").containsEntry("mode", "live").containsEntry("offer_seconds", 20)
            .containsEntry("fleet_stage_seconds", 300).containsEntry("offers_at_once", 1).containsEntry("offer_rounds", 0)
            .containsEntry("fair_band_m", 1500).containsEntry("radius_m", 5000).containsEntry("published_by", null)
            .containsEntry("withdrawn_at", null).containsEntry("at_once", true).containsEntry("offer_range", "[20, 60]")
            .containsEntry("stage_range", "[45, 300]").containsEntry("radius_range", "[1000, 10000]");
        DispatchPolicy inForce = store.currentDispatchPolicy().orElseThrow();
        assertThat(inForce.version()).isEqualTo(month + "-v8");
        assertThat(inForce.wholeStage()).as("riders keep every order for the whole 5 minutes").isTrue();
        assertThat(db.queryForMap("SELECT offer_seconds, offer_rounds, withdrawn_at FROM fleet_schema.dispatch_policy WHERE version = ?",
            month + "-v3")).as("the version riders had stays as it was").containsEntry("offer_seconds", 30).containsEntry("offer_rounds", 3)
            .containsEntry("withdrawn_at", null);
        assertThat(db.queryForObject("SELECT withdrawn_at IS NOT NULL FROM fleet_schema.dispatch_policy WHERE version = ?", Boolean.class,
            month + "-v7")).as("a version scheduled for later would have brought the old rules back").isTrue();

        // The notice trigger is back on: published versions never change, and a change to the rules now needs 14 days.
        assertThat(db.queryForObject("SELECT tgenabled FROM pg_trigger WHERE tgname = 'dispatch_policy_notice' AND tgrelid = "
            + "'fleet_schema.dispatch_policy'::regclass", String.class)).isEqualTo("O");
        assertThatThrownBy(() -> db.update("UPDATE fleet_schema.dispatch_policy SET offer_seconds = 25 WHERE version = ?", month + "-v8"))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("cannot change");
        assertThatThrownBy(() -> policy(month + "-v9", "now()", "live", 20, 300, 3, 1, 0))
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("changes how orders are offered");

        // What the console's mode switch saves (FleetSetupService.setDispatchPolicy): the built-in values and rules. They are
        // the rule, so the switch saves at once, inside the declared ranges.
        Map<String, Number> values = FleetPolicyStore.BUILT_IN_VALUES;
        DispatchRules rules = DispatchRules.BUILT_IN;
        db.update("INSERT INTO fleet_schema.dispatch_policy (version, effective_from, mode, offer_seconds, fleet_stage_seconds, radius_m, "
            + "pickup_detour_percent, per_order_overhead_paise, cost_guard_premium_paise, pidge_stage_seconds, offers_at_once, offer_rounds, "
            + "fair_band_m, ranges) VALUES (?, now(), 'shadow', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')", month + "-v9",
            values.get("offer_seconds"), values.get("fleet_stage_seconds"), values.get("radius_m"), values.get("pickup_detour_percent"),
            values.get("per_order_overhead_paise"), values.get("cost_guard_premium_paise"), values.get("pidge_stage_seconds"),
            rules.offersAtOnce(), rules.offerRounds(), rules.fairBandM());
        assertThat(store.publishDispatchPolicy(month + "-v9", UUID.randomUUID())).isEmpty();
        assertThat(store.currentDispatchPolicy().orElseThrow()).extracting(DispatchPolicy::version, DispatchPolicy::mode,
            DispatchPolicy::offerSeconds, DispatchPolicy::fleetStageSeconds, DispatchPolicy::wholeStage)
            .containsExactly(month + "-v9", "shadow", 20, 300, true);
    }

    @Test
    void aPolicyThatIsOffStaysOff() {
        migrateTo("186");
        policy(month + "-v2", "now() - INTERVAL '1 day'", "off", 40, 60, 3, 1, 0);
        migrateTo("187");
        assertThat(store.currentDispatchPolicy().orElseThrow()).extracting(DispatchPolicy::version, DispatchPolicy::mode,
            DispatchPolicy::offerSeconds, DispatchPolicy::fleetStageSeconds, DispatchPolicy::offersAtOnce, DispatchPolicy::offerRounds)
            .containsExactly(month + "-v3", "off", 20, 300, 1, 0);
    }

    @Test
    void aDatabaseWithNoPolicyInForceOnlyGetsTheWiderRanges() {
        migrateTo("187");
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.dispatch_policy WHERE status = 'PUBLISHED'", Integer.class)).isZero();
        assertThat(db.queryForMap("SELECT status, ranges ->> 'offer_seconds' AS offer_range, ranges ->> 'fleet_stage_seconds' AS stage_range "
            + "FROM fleet_schema.dispatch_policy WHERE version = '2026-10-v1'")).as("the seeded draft's declared ranges fit the rule")
            .containsEntry("status", "DRAFT").containsEntry("offer_range", "[20, 60]").containsEntry("stage_range", "[45, 300]");
    }

    private void migrateTo(String version) {
        Flyway.configure().dataSource(dataSource).schemas("payment_schema").defaultSchema("payment_schema")
            .locations("classpath:db/migration").target(version).load().migrate();
    }

    /** A published copy of the seeded draft with these values and rules, starting at startsAt (SQL), without the 2026-11-v2 lines. */
    private void policy(String version, String startsAt, String mode, int offerSeconds, int stageSeconds, int atOnce, int rounds, int bandM) {
        db.update("""
            DO $$
            DECLARE p fleet_schema.dispatch_policy%%ROWTYPE;
            BEGIN
                SELECT * INTO p FROM fleet_schema.dispatch_policy WHERE version = '2026-10-v1';
                p.version := '%s'; p.status := 'PUBLISHED'; p.effective_from := %s; p.published_at := now();
                p.created_at := LEAST(p.effective_from, now()); p.mode := '%s'; p.offer_seconds := %d; p.fleet_stage_seconds := %d;
                p.radius_m := 5000; p.offers_at_once := %d; p.offer_rounds := %d; p.fair_band_m := %d;
                p.joint_matching := false; p.next_order_offers := false;
                INSERT INTO fleet_schema.dispatch_policy VALUES (p.*);
            END $$""".formatted(version, startsAt, mode, offerSeconds, stageSeconds, atOnce, rounds, bandM));
    }
}
