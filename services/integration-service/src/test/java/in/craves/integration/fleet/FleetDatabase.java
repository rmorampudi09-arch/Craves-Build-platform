package in.craves.integration.fleet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** A disposable Postgres (LEDGER_TEST_JDBC_URL, as ReferralDatabase) with every integration migration applied. */
public final class FleetDatabase {
    public final DataSource dataSource;
    public final JdbcTemplate db;
    public final DataSourceTransactionManager transactions;

    public FleetDatabase() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertNotNull(url);
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        dataSource = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        db = new JdbcTemplate(dataSource);
        transactions = new DataSourceTransactionManager(dataSource);
        db.execute("DROP SCHEMA IF EXISTS fleet_schema CASCADE");
        db.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        db.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(dataSource).schemas("payment_schema").defaultSchema("payment_schema")
            .locations("classpath:db/migration").load().migrate();
    }

    /** Fleet on, with the given test mode and nothing configured outside this service. */
    public static FleetProperties properties(boolean testMode) {
        return new FleetProperties(true, true, false, false, testMode, null, null, null, "documents");
    }

    public UUID rider(String name, String phone) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider (id, name, phone, created_by) VALUES (?, ?, ?, ?)", id, name, phone, UUID.randomUUID());
        return id;
    }

    public UUID trip(UUID chefSubOrderId) {
        UUID id = UUID.randomUUID();
        db.update("""
            INSERT INTO fleet_schema.trip (id, chef_sub_order_id, order_id, chef_id, order_code, items_count, kitchen_name,
              kitchen_area, kitchen_address, kitchen_lat, kitchen_lng, chef_phone, customer_first_name, customer_phone,
              drop_area, drop_address, drop_lat, drop_lng)
            VALUES (?, ?, ?, ?, '#0A1B2C3D', 2, 'Amma''s Kitchen', 'Madhapur', 'Road 1', 17.44, 78.39, '+919000000000',
              'Priya', '+919000000001', 'Kondapur', 'Flat 2', 17.46, 78.36)""",
            id, chefSubOrderId, UUID.randomUUID(), UUID.randomUUID());
        return id;
    }
}
