package in.craves.order.idempotency;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** CH-07: a retried checkout with the same Idempotency-Key replays the first result instead of running twice. */
@EnabledIfEnvironmentVariable(named = "CRAVES_DISPOSABLE_TEST_DATABASE", matches = "true")
class IdempotencyKeyFilterDatabaseTest {
    private final AtomicInteger executions = new AtomicInteger();
    private final FilterChain checkout = (request, response) -> {
        executions.incrementAndGet();
        request.getInputStream().readAllBytes();
        HttpServletResponse http = (HttpServletResponse) response;
        http.setStatus(201);
        http.setContentType("application/json");
        http.setHeader("Location", "/api/v1/checkout/c-" + executions.get());
        http.getWriter().write("{\"checkoutId\":\"c-" + executions.get() + "\"}");
    };
    private IdempotencyKeyFilter filter;
    private JdbcTemplate jdbc;

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
        filter = new IdempotencyKeyFilter(jdbc, "order_schema.idempotency_record", List.of("/api/v1/admin/**"), Authentication::getName);
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("customer-1", null, "ROLE_CUSTOMER"));
    }

    @AfterEach
    void clearIdentity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void sameKeyAndBodyReplaysTheFirstResponse() throws Exception {
        MockHttpServletResponse first = send("checkout-0001-retry", "{\"deliveryAddressId\":\"a1\"}");
        MockHttpServletResponse retry = send("checkout-0001-retry", "{\"deliveryAddressId\":\"a1\"}");

        assertEquals(1, executions.get());
        assertEquals(201, retry.getStatus());
        assertEquals(first.getContentAsString(), retry.getContentAsString());
        assertEquals("true", retry.getHeader("Idempotent-Replayed"));
        assertEquals(first.getHeader("Location"), retry.getHeader("Location"));
    }

    @Test
    void aKeyOlderThanTheRetentionWindowStartsFresh() throws Exception {
        send("checkout-0003-expired", "{}");
        jdbc.update("UPDATE order_schema.idempotency_record SET created_at = now() - INTERVAL '73 hours'");

        MockHttpServletResponse again = send("checkout-0003-expired", "{}");

        assertEquals(2, executions.get());
        assertEquals(null, again.getHeader("Idempotent-Replayed"));
    }

    @Test
    void signedOutRequestsAreNotCovered() throws Exception {
        SecurityContextHolder.clearContext();
        send("checkout-0004-anon", "{}");
        send("checkout-0004-anon", "{}");

        assertEquals(2, executions.get());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_schema.idempotency_record", Integer.class));
    }

    @Test
    void sameKeyWithADifferentBodyIsRejected() throws Exception {
        send("checkout-0002-reuse", "{\"deliveryAddressId\":\"a1\"}");
        MockHttpServletResponse reused = send("checkout-0002-reuse", "{\"deliveryAddressId\":\"a2\"}");

        assertEquals(1, executions.get());
        assertEquals(422, reused.getStatus());
    }

    @Test
    void requestsWithoutTheHeaderRunAsBefore() throws Exception {
        send(null, "{}");
        send(null, "{}");

        assertEquals(2, executions.get());
    }

    private MockHttpServletResponse send(String key, String body) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/checkout");
        request.setContentType("application/json");
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        if (key != null) {
            request.addHeader(IdempotencyKeyFilter.HEADER, key);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, checkout);
        return response;
    }
}
