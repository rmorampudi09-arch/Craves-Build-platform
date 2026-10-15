package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** CH-05 expand step: version, payment/refund projections and the status CHECK, with no writer changed. */
@EnabledIfEnvironmentVariable(named = "CRAVES_DISPOSABLE_TEST_DATABASE", matches = "true")
class OrderStatusProjectionDatabaseTest {
    private JdbcTemplate jdbc;
    private final UUID kitchen = UUID.randomUUID();

    @BeforeEach
    void migrate() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var dataSource = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(10);
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        Flyway.configure().dataSource(dataSource).defaultSchema("order_schema").schemas("order_schema")
            .locations("classpath:db/migration").load().migrate();
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id, identity_id) VALUES (?, ?)", kitchen, UUID.randomUUID());
    }

    @Test
    void versionMovesOnlyWithStatusAndProjectionsFollowTheLegacyStatus() {
        UUID order = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO order_schema.customer_order (id, checkout_id, customer_identity_id, kitchen_id, status,
                food_subtotal, platform_fee, tax_amount, delivery_fee, grand_total)
            VALUES (?, ?, ?, ?, 'PAYMENT_PENDING', 100, 5, 5, 20, 130)
            """, order, UUID.randomUUID(), UUID.randomUUID(), kitchen);
        assertEquals(Map.of("version", 0L, "payment_status", "PENDING", "refund_status", "NONE"), projection(order));

        jdbc.update("""
            UPDATE order_schema.customer_order SET status = 'CHEF_ACCEPTANCE_PENDING', chef_acceptance_requested_at = now(),
                chef_acceptance_expires_at = now() + INTERVAL '30 minutes' WHERE id = ?
            """, order);
        jdbc.update("UPDATE order_schema.customer_order SET updated_at = now() WHERE id = ?", order);

        assertEquals(Map.of("version", 1L, "payment_status", "CAPTURED", "refund_status", "NONE"), projection(order));
        assertThrows(DataIntegrityViolationException.class,
            () -> jdbc.update("UPDATE order_schema.customer_order SET status = 'NOT_A_STATUS' WHERE id = ?", order));
    }

    private Map<String, Object> projection(UUID order) {
        return jdbc.queryForMap("SELECT version, payment_status, refund_status FROM order_schema.customer_order WHERE id = ?", order);
    }
}
