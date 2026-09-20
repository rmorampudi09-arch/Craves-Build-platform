package in.craves.referral;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Only TestDatabase's explicitly disposable local referral_test database is used. */
class ChefMinimumMigrationIT {
    @Test void forwardUpgradePreservesPriorChecksumsAndCreatesNoRewardsOrActivation() {
        DataSource ds=TestDatabase.reset(); // Enforces database name, host and confirmation.
        JdbcTemplate jdbc=new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA referral_schema CASCADE");
        var config=Flyway.configure().dataSource(ds).schemas("referral_schema")
            .defaultSchema("referral_schema").table("referral_flyway_history")
            .locations("classpath:db/referral_migration").cleanDisabled(true);
        config.target("10").load().migrate();
        var history=jdbc.queryForList("SELECT version,script,checksum FROM referral_schema.referral_flyway_history WHERE type='SQL' ORDER BY installed_rank");
        String seed=jdbc.queryForObject("SELECT row_to_json(p)::text FROM referral_schema.policy p WHERE id=1",String.class);
        String before=jdbc.queryForObject("SELECT pg_get_functiondef('referral_schema.chef_reward_guard()'::regprocedure)",String.class);
        assertNotNull(before);
        assertTrue(before.contains("snapshot.food_paise<=25000"));
        var upgraded=Flyway.configure().dataSource(ds).schemas("referral_schema")
            .defaultSchema("referral_schema").table("referral_flyway_history")
            .locations("classpath:db/referral_migration").cleanDisabled(true).load();
        assertEquals(1,upgraded.migrate().migrationsExecuted);
        upgraded.validate();
        assertEquals(history,jdbc.queryForList("SELECT version,script,checksum FROM referral_schema.referral_flyway_history WHERE type='SQL' AND version<>'11' ORDER BY installed_rank"));
        assertEquals(seed,jdbc.queryForObject("SELECT row_to_json(p)::text FROM referral_schema.policy p WHERE id=1",String.class));
        String after=jdbc.queryForObject("SELECT pg_get_functiondef('referral_schema.chef_reward_guard()'::regprocedure)",String.class);
        assertNotNull(after);
        assertTrue(after.contains("snapshot.food_paise<25000"));
        assertFalse(after.contains("snapshot.food_paise<=25000"));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM pg_trigger WHERE tgrelid='referral_schema.chef_reward'::regclass AND tgname='chef_reward_source_guard' AND tgenabled='O'",Integer.class));
        for(String table:java.util.List.of("policy_activation","chef_reward","chef_posting","outbox"))
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM referral_schema."+table,Integer.class));
        assertEquals(0,upgraded.migrate().migrationsExecuted);
    }
}
