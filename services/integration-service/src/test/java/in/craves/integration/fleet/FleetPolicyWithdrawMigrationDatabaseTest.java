package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V185 withdraws only V184's own 2026-11-v2, before it starts, once (a disposable Postgres, as FleetDatabase). */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPolicyWithdrawMigrationDatabaseTest {
    static final String V185 = "/db/migration/V185__fleet_withdraw_policy_2026_11_v2.sql";
    DataSource dataSource;
    JdbcTemplate db;

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
    }

    @Test
    void withdrawsV184sOwnCopyBeforeItStartsAndASecondRunChangesNothing() throws Exception {
        migrateTo("183");
        // Production before V184: a policy riders are shown, in force.
        publish("2026-10-v5", "now() - INTERVAL '1 day'", null);
        migrateTo("184");
        assertThat(db.queryForMap("SELECT published_by, withdrawn_at, joint_matching, next_order_offers, "
            + "effective_from > now() + INTERVAL '13 days' AS ahead FROM fleet_schema.dispatch_policy WHERE version = '2026-11-v2'"))
            .as("V184 copied it, published by no one, with both lines, 14 days ahead")
            .containsEntry("published_by", null).containsEntry("withdrawn_at", null)
            .containsEntry("joint_matching", true).containsEntry("next_order_offers", true).containsEntry("ahead", true);

        migrateTo("185");
        Timestamp withdrawn = withdrawnAt("2026-11-v2");
        assertThat(withdrawn).isNotNull();
        assertThat(withdrawnAt("2026-10-v5")).as("the policy in force stays").isNull();

        String sql = new String(getClass().getResourceAsStream(V185).readAllBytes(), StandardCharsets.UTF_8);
        assertThat(db.update(sql)).as("a second run").isZero();
        assertThat(withdrawnAt("2026-11-v2")).isEqualTo(withdrawn);
    }

    @Test
    void leavesA2026_11_v2PublishedByAPerson() {
        migrateTo("184");
        publish("2026-11-v2", "now() + INTERVAL '15 days'", UUID.randomUUID());
        migrateTo("185");
        assertThat(withdrawnAt("2026-11-v2")).isNull();
    }

    @Test
    void leavesA2026_11_v2AlreadyInForce() {
        migrateTo("184");
        publish("2026-11-v2", "now() - INTERVAL '1 hour'", null);
        migrateTo("185");
        assertThat(withdrawnAt("2026-11-v2")).isNull();
    }

    private void migrateTo(String version) {
        Flyway.configure().dataSource(dataSource).schemas("payment_schema").defaultSchema("payment_schema")
            .locations("classpath:db/migration").target(version).load().migrate();
    }

    /** A published copy of the seeded draft, starting at startsAt (SQL), published by publishedBy (null: no one). */
    private void publish(String version, String startsAt, UUID publishedBy) {
        db.update("""
            DO $$
            DECLARE p fleet_schema.dispatch_policy%%ROWTYPE;
            BEGIN
                SELECT * INTO p FROM fleet_schema.dispatch_policy WHERE version = '2026-10-v1';
                p.version := '%s'; p.status := 'PUBLISHED'; p.effective_from := %s;
                p.published_at := LEAST(p.effective_from, now()); p.created_at := p.published_at; p.published_by := %s;
                INSERT INTO fleet_schema.dispatch_policy VALUES (p.*);
            END $$""".formatted(version, startsAt, publishedBy == null ? "NULL" : "'" + publishedBy + "'"));
    }

    private Timestamp withdrawnAt(String version) {
        return db.queryForObject("SELECT withdrawn_at FROM fleet_schema.dispatch_policy WHERE version = ?", Timestamp.class, version);
    }
}
