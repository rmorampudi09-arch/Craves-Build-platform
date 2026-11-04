package in.craves.order.advanced;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.order.advanced.KitchenLoad.KitchenLoadResponse;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** M24e on real PostgreSQL: which orders load a kitchen, the operations numbers, rounding, the cap and the per-kitchen cache. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class KitchenLoadDatabaseTest {
    private JdbcTemplate jdbc;
    private final UUID kitchen = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-11-03T12:00:00Z");

    @BeforeEach
    void setup() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        Flyway.configure().dataSource(ds).defaultSchema("order_schema").schemas("order_schema")
            .locations("classpath:db/migration").load().migrate();
    }

    private KitchenLoad load(String minutesPerOrder, String max) {
        return new KitchenLoad(jdbc, Clock.fixed(now, ZoneOffset.UTC), minutesPerOrder, max);
    }

    private void order(UUID kitchenId, String status, Instant requestedFulfilment) {
        jdbc.update("""
            INSERT INTO order_schema.customer_order (id, customer_identity_id, kitchen_id, chef_identity_id, status,
                prep_time_minutes, accepted_at, ready_at, chef_acceptance_requested_at, chef_acceptance_expires_at,
                food_subtotal, platform_fee, tax_amount, delivery_fee, grand_total, requested_fulfilment_at)
            VALUES (?, ?, ?, ?, ?, 20, now(), now() + interval '20 minutes', now(), now() + interval '5 minutes',
                100, 0, 0, 0, 100, ?)
            """, UUID.randomUUID(), UUID.randomUUID(), kitchenId, UUID.randomUUID(), status,
            requestedFulfilment == null ? null : Timestamp.from(requestedFulfilment));
    }

    @Test
    void offUntilOperationsSetBothNumbers() {
        order(kitchen, "CHEF_ACCEPTED", null);
        for (KitchenLoad off : new KitchenLoad[] {load("", "60"), load("7", null), load("0", "60"), load("61", "60"), load("7", "241"), load("x", "60")}) {
            KitchenLoadResponse answer = off.load(kitchen);
            assertFalse(answer.configured());
            assertNull(answer.extraMinutes());
            assertNull(answer.busy());
        }
    }

    @Test
    void onlyOrdersStillToCookAndDueSoonCountRoundedUpAndCapped() {
        order(kitchen, "PAID", null);
        order(kitchen, "CHEF_ACCEPTANCE_PENDING", null);
        order(kitchen, "CHEF_ACCEPTED", null);
        order(kitchen, "PREPARING", now.plus(Duration.ofMinutes(50)));
        // Not counted: already cooked, finished, refused, unpaid, scheduled for later, or another kitchen.
        order(kitchen, "READY_FOR_PICKUP", null);
        order(kitchen, "OUT_FOR_DELIVERY", null);
        order(kitchen, "DELIVERED", null);
        order(kitchen, "CANCELLED", null);
        order(kitchen, "PAYMENT_PENDING", null);
        order(kitchen, "CHEF_ACCEPTED", now.plus(Duration.ofHours(3)));
        order(UUID.randomUUID(), "CHEF_ACCEPTED", null);

        KitchenLoadResponse answer = load("7", "60").load(kitchen);
        assertTrue(answer.configured());
        assertEquals(50, answer.extraMinutes()); // 4 open orders x 7 = 28, in steps of 25 (3 x 7 = 21, rounded to 5)
        assertTrue(answer.busy());
        assertEquals(20, load("7", "20").load(kitchen).extraMinutes()); // capped

        KitchenLoadResponse quiet = load("7", "60").load(UUID.randomUUID());
        assertEquals(0, quiet.extraMinutes());
        assertFalse(quiet.busy());
    }

    @Test
    void oneMoreOrderDoesNotGiveAwayTheCount() {
        KitchenLoad steps = load("10", "240");
        assertEquals(0, steps.answer(kitchen, 0).extraMinutes());
        // Steps of 30 minutes (three orders of 10): 1, 2 and 3 orders look the same, as do 4, 5 and 6.
        assertEquals(30, steps.answer(kitchen, 1).extraMinutes());
        assertEquals(30, steps.answer(kitchen, 3).extraMinutes());
        assertEquals(60, steps.answer(kitchen, 4).extraMinutes());
        assertEquals(240, steps.answer(kitchen, 1_000_000).extraMinutes());
        assertEquals(15, load("1", "240").answer(kitchen, 2).extraMinutes()); // never steps below 15 minutes
    }

    @Test
    void stuckOrdersStopCounting() {
        order(kitchen, "CHEF_ACCEPTED", now.minus(Duration.ofHours(7)));
        assertEquals(0, load("10", "60").load(kitchen).extraMinutes());
    }

    @Test
    void eachReplicaAsksTheDatabaseAtMostOncePerKitchenEvery30Seconds() throws Exception {
        KitchenLoad cached = load("10", "60");
        order(kitchen, "CHEF_ACCEPTED", null);
        assertEquals(30, cached.load(kitchen).extraMinutes());
        for (int i = 0; i < 3; i++) order(kitchen, "CHEF_ACCEPTED", null);
        assertEquals(30, cached.load(kitchen).extraMinutes());
        assertEquals(60, load("10", "60").load(kitchen).extraMinutes());

        var mvc = MockMvcBuilders.standaloneSetup(new KitchenLoadController(cached)).build();
        mvc.perform(get("/api/v1/orders/kitchen-load").param("kitchenId", kitchen.toString())).andExpect(status().isOk())
            .andExpect(jsonPath("$.configured").value(true)).andExpect(jsonPath("$.extraMinutes").value(30))
            .andExpect(jsonPath("$.busy").value(true));
        mvc.perform(get("/api/v1/orders/kitchen-load").param("kitchenId", "not-a-uuid")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/orders/kitchen-load")).andExpect(status().isBadRequest());
    }
}
