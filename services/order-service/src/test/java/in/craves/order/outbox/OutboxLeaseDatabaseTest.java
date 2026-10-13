package in.craves.order.outbox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.service.NotificationOutboxDispatcherRepository;
import in.craves.order.service.PendingNotificationOutboxEvent;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** CH-02: outbox rows are never silently stuck; expired leases come back, exhausted rows go DEAD. */
@EnabledIfEnvironmentVariable(named = "CRAVES_DISPOSABLE_TEST_DATABASE", matches = "true")
class OutboxLeaseDatabaseTest {
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
    }

    @Test
    void domainEventLeaseThatExpiredOnTheFinalAttemptGoesDeadWhileEarlierAttemptsAreReclaimed() {
        UUID exhausted = domainEvent("CHEF_ACCEPTED_ORDER", "PROCESSING", 10, "now() - interval '10 minutes'", "now()");
        UUID retryable = domainEvent("CHEF_ACCEPTED_ORDER", "PROCESSING", 3, "now() - interval '10 minutes'", "now()");
        OrderDomainOutboxRepository repository = new OrderDomainOutboxRepository(jdbc);

        assertEquals(1, repository.deadLetterExhausted(10, 300));
        assertEquals("DEAD", status("domain_event_outbox", exhausted));
        List<OrderDomainOutboxRecord> claimed = repository.claimBatch(20, 10, 300, UUID.randomUUID(), List.of("CHEF_ACCEPTED_ORDER"));
        assertEquals(List.of(retryable), claimed.stream().map(OrderDomainOutboxRecord::id).toList());
    }

    @Test
    void blockedEventTypesAreReportedAndOnlyDeadLetteredWhenThatPolicyIsChosen() {
        domainEvent("REFUND_REQUESTED", "PENDING", 0, "NULL", "now() - interval '10 minutes'");
        UUID recent = domainEvent("REFUND_REQUESTED", "PENDING", 0, "NULL", "now()");
        OrderDomainOutboxRepository repository = new OrderDomainOutboxRepository(jdbc);

        assertEquals(Map.of("REFUND_REQUESTED", 1), repository.blockedEventTypeBacklog(List.of("CHEF_ACCEPTED_ORDER"), 300));
        assertEquals(1, repository.deadLetterBlockedEventTypes(List.of("CHEF_ACCEPTED_ORDER"), 300));
        assertEquals("PENDING", status("domain_event_outbox", recent));
    }

    @Test
    void notificationOutboxReclaimsAnExpiredLeaseOnceAndDeadLettersExhaustedRows() {
        UUID stale = notification("PROCESSING", 2, "now() - interval '10 minutes'");
        UUID exhausted = notification("FAILED", 5, "now()");
        UUID live = notification("PROCESSING", 1, "now()");
        NotificationOutboxDispatcherRepository repository = new NotificationOutboxDispatcherRepository(jdbc, new ObjectMapper());

        assertEquals(1, repository.deadLetterExhausted(5));
        assertEquals("DEAD", status("notification_outbox", exhausted));
        assertEquals(List.of(stale), repository.findDue(25, 5).stream().map(PendingNotificationOutboxEvent::id).toList());
        assertTrue(repository.markProcessing(stale));
        assertFalse(repository.markProcessing(stale), "a fresh lease is not taken twice");
        assertFalse(repository.markProcessing(live), "a live lease is not stolen");
    }

    private UUID domainEvent(String eventType, String status, int attempts, String lockedAt, String createdAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO order_schema.domain_event_outbox (
                id, event_key, aggregate_type, aggregate_id, event_type, event_version, occurred_at,
                correlation_id, source, subject, payload_json, status, attempts, lock_token, locked_at, created_at
            ) VALUES (?, ?, 'CUSTOMER_ORDER', ?, ?, '1.0', now(), ?, 'order-service', 'test', '{}'::jsonb, ?, ?, ?, %s, %s)
            """.formatted(lockedAt, createdAt),
            id, eventType + ":" + id, UUID.randomUUID(), eventType, UUID.randomUUID(), status, attempts,
            "PROCESSING".equals(status) ? UUID.randomUUID() : null);
        return id;
    }

    private UUID notification(String status, int attemptCount, String updatedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO order_schema.notification_outbox (
                id, event_key, event_type, aggregate_type, aggregate_id, user_identity_id, user_role,
                title, body, status, attempt_count, updated_at
            ) VALUES (?, ?, 'CHEF_ORDER_AWAITING_ACCEPTANCE', 'CUSTOMER_ORDER', ?, ?, 'CHEF', 'New order', 'Accept it', ?, ?, %s)
            """.formatted(updatedAt),
            id, "test:" + id, UUID.randomUUID(), UUID.randomUUID(), status, attemptCount);
        return id;
    }

    private String status(String table, UUID id) {
        return jdbc.queryForObject("SELECT status FROM order_schema." + table + " WHERE id = ?", String.class, id);
    }
}
