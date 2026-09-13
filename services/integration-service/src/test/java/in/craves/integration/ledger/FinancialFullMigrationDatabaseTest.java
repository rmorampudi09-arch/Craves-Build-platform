package in.craves.integration.ledger;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinancialFullMigrationDatabaseTest {
    @Test void entireIntegrationMigrationChainAppliesAndValidatesTwice() {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        var jdbc=new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        jdbc.execute("DROP TABLE IF EXISTS public.flyway_schema_history");
        var flyway=Flyway.configure().dataSource(ds).defaultSchema("public").locations("classpath:db/migration").load();
        var first=flyway.migrate();
        assertTrue(first.success);assertTrue(first.migrationsExecuted>20);
        flyway.validate();
        assertEquals(0,flyway.migrate().migrationsExecuted);
        assertTrue(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='payment_schema' AND table_name='ledger_transaction')",Boolean.class));
        assertTrue(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='payment_schema' AND table_name='chef_settlement_item' AND column_name='active_reservation')",Boolean.class));
    }
}
