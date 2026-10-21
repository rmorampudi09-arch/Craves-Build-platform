package in.craves.order.delivery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.order.web.InternalDeliveryCodeController;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Real PostgreSQL behaviour of the delivery code: idempotent generation, lock after 5 wrong codes, hidden once used. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class DeliveryCodeDatabaseTest {
    private JdbcTemplate jdbc;
    private DeliveryCodeService codes;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        // V16 depends on the shared business database's Catalog ownership contract. This is its test fixture.
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        Flyway.configure().dataSource(ds).defaultSchema("order_schema").schemas("order_schema")
            .locations("classpath:db/migration").load().migrate();
        codes = new DeliveryCodeService(jdbc);
        mvc = MockMvcBuilders.standaloneSetup(new InternalDeliveryCodeController(codes, "unit-secret")).build();
    }

    @Test
    void generationIsIdempotentAndAlwaysFourDigits() {
        UUID id = order();

        codes.ensureCode(id);
        String first = code(id);
        codes.ensureCode(id);

        assertTrue(first.matches("[0-9]{4}"));
        assertEquals(first, code(id));
        assertEquals(1, jdbc.queryForObject(
            "SELECT count(*) FROM order_schema.order_delivery_code WHERE order_id = ?", Integer.class, id));
    }

    @Test
    void fiveWrongCodesLockItEvenForTheRightCode() throws Exception {
        UUID id = order();
        codes.ensureCode(id);
        String right = code(id);
        String wrong = right.equals("0000") ? "1111" : "0000";

        for (int left = 4; left >= 0; left--) {
            verify(id, wrong).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("DELIVERY_CODE_INVALID"))
                .andExpect(jsonPath("$.attemptsLeft").value(left));
        }
        verify(id, right).andExpect(status().isLocked())
            .andExpect(jsonPath("$.code").value("DELIVERY_CODE_LOCKED"));
        assertNull(jdbc.queryForObject(
            "SELECT verified_at FROM order_schema.order_delivery_code WHERE order_id = ?", Object.class, id));
    }

    @Test
    void rightCodeVerifiesOnceAndIsThenHiddenFromTheCustomer() throws Exception {
        UUID id = order();
        codes.ensureCode(id);
        String right = code(id);
        assertEquals(right, codes.codeForCustomer(id, "craves_fleet", "AT_DROPOFF"));

        verify(id, right).andExpect(status().isOk()).andExpect(jsonPath("$.verified").value(true));
        verify(id, right).andExpect(status().isOk()).andExpect(jsonPath("$.verified").value(true));

        assertNull(codes.codeForCustomer(id, "craves_fleet", "AT_DROPOFF"));
        assertEquals("CHEF_ACCEPTED", jdbc.queryForObject(
            "SELECT status FROM order_schema.customer_order WHERE id = ?", String.class, id));
    }

    @Test
    void orderWithoutACodeIsNotFound() throws Exception {
        verify(order(), "0427").andExpect(status().isNotFound());
        verify(UUID.randomUUID(), "0427").andExpect(status().isNotFound());
    }

    private ResultActions verify(UUID id, String code) throws Exception {
        return mvc.perform(post("/internal/v1/orders/{orderId}/delivery-code/verify", id)
            .header("X-Craves-Internal-Secret", "unit-secret")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"" + code + "\"}"));
    }

    private String code(UUID id) {
        return jdbc.queryForObject("SELECT code FROM order_schema.order_delivery_code WHERE order_id = ?", String.class, id);
    }

    private UUID order() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO order_schema.customer_order (id, customer_identity_id, kitchen_id, chef_identity_id, status,
                prep_time_minutes, accepted_at, ready_at, food_subtotal, platform_fee, tax_amount, delivery_fee, grand_total)
            VALUES (?, ?, ?, ?, 'CHEF_ACCEPTED', 20, now(), now() + interval '20 minutes', 100, 0, 0, 0, 100)
            """, id, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        return id;
    }
}
