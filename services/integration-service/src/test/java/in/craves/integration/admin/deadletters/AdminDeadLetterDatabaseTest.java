package in.craves.integration.admin.deadletters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.integration.admin.deadletters.AdminDeadLetterController.DeadLetter;
import in.craves.integration.admin.deadletters.AdminDeadLetterController.DeadLetterPage;
import in.craves.integration.admin.deadletters.AdminDeadLetterController.Source;
import in.craves.integration.admin.deadletters.AdminDeadLetterController.Status;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import java.time.Instant;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.security.CravesPrincipal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

/** Handbook 105 read-only console on PostgreSQL with every integration migration (LEDGER_TEST_JDBC_URL, as FleetDatabase). */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class AdminDeadLetterDatabaseTest {
    private static final String REASON = "Checking stuck delivery updates for ticket 4411";

    private FleetDatabase database;
    private DeliveryCommandProperties delivery;
    private AdminDeadLetterController console;

    @BeforeEach
    void setUp() {
        database = new FleetDatabase();
        delivery = new DeliveryCommandProperties();
        delivery.setWebhookProcessingEnabled(true);
        console = new AdminDeadLetterController(new DeadLetterRepository(database.db), delivery, true, true);
    }

    @Test
    void listsDeadDeliveryWebhooksWithoutTheirPayloadAndAuditsTheRead() {
        UUID dead = webhook("borzo", "evt-1", "DEAD_LETTER", "No delivery job matches order 7\u0007\nsecond line");
        webhook("pidge", "evt-2", "DEAD_LETTER", "timeout");
        webhook("borzo", "evt-3", "PROCESSED", null);
        UUID failed = webhook("borzo", "evt-4", "FAILED", "HTTP 503");
        UUID correlation = UUID.randomUUID();

        ResponseEntity<DeadLetterPage> answer = console.listDeadLetters(as("OPERATIONS_ADMIN"), Source.DELIVERY_WEBHOOK,
            Status.DEAD_LETTER, "borzo", 50, 0, REASON, correlation.toString());

        DeadLetterPage page = answer.getBody();
        assertThat(page.total()).isEqualTo(1);
        DeadLetter item = page.items().get(0);
        assertThat(item.id()).isEqualTo(dead);
        assertThat(item.provider()).isEqualTo("borzo");
        assertThat(item.providerEventId()).isEqualTo("evt-1");
        assertThat(item.attemptCount()).isEqualTo(10);
        assertThat(item.lastError()).isEqualTo("No delivery job matches order 7  second line");
        assertThat(item.payloadBytes()).isPositive();
        assertThat(answer.getHeaders().getFirst("X-Correlation-ID")).isEqualTo(correlation.toString());
        assertThat(answer.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(database.db.queryForObject("SELECT count(*) FROM payment_schema.admin_investigation_audit WHERE correlation_id = ? "
            + "AND resource_type = 'DEAD_LETTERS_DELIVERY_WEBHOOK' AND action = 'LIST_DEAD_LETTERS' AND reason = ?",
            Integer.class, correlation, REASON)).isEqualTo(1);

        DeadLetterPage allDead = console.listDeadLetters(as("SUPPORT_ADMIN"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 50, 0,
            REASON, null).getBody();
        assertThat(allDead.items()).extracting(DeadLetter::providerEventId).containsExactlyInAnyOrder("evt-1", "evt-2");
        DeadLetterPage stillRetrying = console.listDeadLetters(as("AUDIT_ADMIN"), Source.DELIVERY_WEBHOOK, Status.FAILED, null, 50, 0,
            REASON, null).getBody();
        assertThat(stillRetrying.items()).extracting(DeadLetter::id).containsExactly(failed);
    }

    @Test
    void cashfreeWebhooksAreForPaymentsAdminsOnly() {
        database.db.update("INSERT INTO payment_schema.cashfree_webhook_delivery (id, idempotency_key, webhook_version, webhook_timestamp, "
                + "webhook_signature, raw_payload, processing_status, attempt_count, last_error) VALUES (?, ?, '2025-01-01', 1, 'sig', "
                + "'{\"data\":{\"customer_details\":{\"customer_phone\":\"9999999999\"}}}', 'DEAD_LETTER', 10, 'Duplicate key')",
            UUID.randomUUID(), "cf-1");

        assertThatThrownBy(() -> console.listDeadLetters(as("OPERATIONS_ADMIN"), Source.CASHFREE_WEBHOOK, Status.DEAD_LETTER, null, 50, 0,
            REASON, null)).isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(403));
        DeadLetterPage page = console.listDeadLetters(as("PAYMENTS_ADMIN"), Source.CASHFREE_WEBHOOK, Status.DEAD_LETTER, null, 50, 0,
            REASON, null).getBody();

        assertThat(page.items()).singleElement().satisfies(item -> {
            assertThat(item.provider()).isEqualTo("cashfree");
            assertThat(item.providerEventId()).isEqualTo("cf-1");
            assertThat(item.lastError()).isEqualTo("Duplicate key");
        });
        assertThat(page.toString()).doesNotContain("9999999999");
    }

    @Test
    void listsDeadDeliveryCommandsWithTheirOrder() {
        UUID order = UUID.randomUUID();
        UUID subOrder = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_command (id, chef_sub_order_id, order_id, command_type, status, dispatch_at, "
                + "attempt_count, idempotency_key, payload, last_error) VALUES (?, ?, ?, 'QUOTE_AND_CREATE', 'DEAD_LETTER', now(), 5, ?, "
                + "'{\"dropoff\":{\"phone\":\"9888888888\"}}'::jsonb, 'Delivery creation failed across 2 provider attempts')",
            UUID.randomUUID(), subOrder, order, "cmd-" + subOrder);

        DeadLetterPage page = console.listDeadLetters(as("PLATFORM_ADMIN"), Source.DELIVERY_COMMAND, Status.DEAD_LETTER, null, 10, 0,
            REASON, null).getBody();

        assertThat(page.items()).singleElement().satisfies(item -> {
            assertThat(item.orderId()).isEqualTo(order);
            assertThat(item.chefSubOrderId()).isEqualTo(subOrder);
            assertThat(item.kind()).isEqualTo("QUOTE_AND_CREATE");
            assertThat(item.attemptCount()).isEqualTo(5);
        });
        assertThat(page.toString()).doesNotContain("9888888888");
    }

    @Test
    void refusesWhenSwitchedOffOrAskedBadly() {
        AdminDeadLetterController off = new AdminDeadLetterController(new DeadLetterRepository(database.db), delivery, false, true);
        assertStatus(() -> off.listDeadLetters(as("PLATFORM_ADMIN"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 50, 0, REASON, null), 404);
        assertStatus(() -> console.listDeadLetters(null, Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 50, 0, REASON, null), 401);
        assertStatus(() -> console.listDeadLetters(as("CHEF"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 50, 0, REASON, null), 403);
        assertStatus(() -> console.listDeadLetters(as("PLATFORM_ADMIN"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 50, 0, "short", null), 400);
        assertStatus(() -> console.listDeadLetters(as("PLATFORM_ADMIN"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 50, 0, REASON, "abc"), 400);
        assertStatus(() -> console.listDeadLetters(as("PLATFORM_ADMIN"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 101, 0, REASON, null), 400);
        assertStatus(() -> console.listDeadLetters(as("PLATFORM_ADMIN"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, "Borzo'--", 50, 0, REASON, null), 400);
        assertStatus(() -> console.listDeadLetters(as("PAYMENTS_ADMIN"), Source.CASHFREE_WEBHOOK, Status.DEAD_LETTER, "borzo", 50, 0, REASON, null), 400);
        assertThat(database.db.queryForObject("SELECT count(*) FROM payment_schema.admin_investigation_audit", Integer.class)).isZero();
    }

    @Test
    void operationsGiveADeadWebhookExactlyOneMoreAttempt() {
        UUID dead = webhook("borzo", "evt-9", "DEAD_LETTER", "No delivery job matches order 9");
        UUID correlation = UUID.randomUUID();

        ResponseEntity<DeadLetter> answer = console.retryDeadLetter(as("OPERATIONS_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON,
            correlation.toString());

        assertThat(answer.getBody().status()).isEqualTo("FAILED");
        assertThat(answer.getBody().attemptCount()).isEqualTo(9);
        assertThat(answer.getBody().lastError()).isEqualTo("No delivery job matches order 9");
        assertThat(answer.getHeaders().getFirst("X-Correlation-ID")).isEqualTo(correlation.toString());
        assertThat(answer.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(database.db.queryForObject("SELECT next_attempt_at <= now() AND processed_at IS NULL FROM delivery_schema.delivery_webhook_inbox "
            + "WHERE id = ?", Boolean.class, dead)).isTrue();
        assertThat(database.db.queryForObject("SELECT count(*) FROM payment_schema.admin_investigation_audit WHERE resource_id = ? "
            + "AND resource_type = 'DEAD_LETTERS_DELIVERY_WEBHOOK' AND action = 'RETRY_DEAD_LETTER' AND reason = ? AND correlation_id = ?",
            Integer.class, dead, REASON, correlation)).isEqualTo(1);

        // The worker's own claim takes it once; a failure dead-letters it again, and nothing claims it after that.
        DeliveryStatusRepository worker = new DeliveryStatusRepository(database.db, new ObjectMapper());
        var claimed = worker.claimWebhookBatch(10, 5, 10);
        assertThat(claimed).extracting(DeliveryStatusRepository.WebhookWorkItem::id).containsExactly(dead);
        worker.markWebhookFailed(dead, claimed.get(0).attemptCount(), 10, Instant.now(), "still no job");
        assertThat(database.db.queryForObject("SELECT processing_status FROM delivery_schema.delivery_webhook_inbox WHERE id = ?",
            String.class, dead)).isEqualTo("DEAD_LETTER");
        assertThat(worker.claimWebhookBatch(10, 5, 10)).isEmpty();
    }

    @Test
    void retriesOnlyDeadDeliveryWebhooksAndOnlyForOperations() {
        UUID dead = webhook("pidge", "evt-10", "DEAD_LETTER", "timeout");
        UUID failed = webhook("pidge", "evt-11", "FAILED", "HTTP 503");
        UUID processed = webhook("pidge", "evt-12", "PROCESSED", null);
        AdminDeadLetterController off = new AdminDeadLetterController(new DeadLetterRepository(database.db), delivery, false, true);
        AdminDeadLetterController readOnly = new AdminDeadLetterController(new DeadLetterRepository(database.db), delivery, true, false);
        DeliveryCommandProperties notProcessing = new DeliveryCommandProperties();
        AdminDeadLetterController idle = new AdminDeadLetterController(new DeadLetterRepository(database.db), notProcessing, true, true);

        assertStatus(() -> off.retryDeadLetter(as("PLATFORM_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON, null), 404);
        assertStatus(() -> readOnly.retryDeadLetter(as("PLATFORM_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON, null), 404);
        assertThat(readOnly.listDeadLetters(as("PLATFORM_ADMIN"), Source.DELIVERY_WEBHOOK, Status.DEAD_LETTER, null, 50, 0, REASON, null)
            .getBody().total()).isEqualTo(1);
        database.db.update("DELETE FROM payment_schema.admin_investigation_audit");
        // Nothing would claim it while webhook processing is off.
        assertStatus(() -> idle.retryDeadLetter(as("PLATFORM_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON, null), 409);
        assertStatus(() -> console.retryDeadLetter(null, dead, Source.DELIVERY_WEBHOOK, REASON, null), 401);
        assertStatus(() -> console.retryDeadLetter(as("SUPPORT_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON, null), 403);
        assertStatus(() -> console.retryDeadLetter(as("AUDIT_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON, null), 403);
        assertStatus(() -> console.retryDeadLetter(as("PLATFORM_ADMIN"), dead, Source.CASHFREE_WEBHOOK, REASON, null), 409);
        assertStatus(() -> console.retryDeadLetter(as("PLATFORM_ADMIN"), dead, Source.DELIVERY_COMMAND, REASON, null), 409);
        assertStatus(() -> console.retryDeadLetter(as("PLATFORM_ADMIN"), dead, Source.DELIVERY_WEBHOOK, "short", null), 400);
        assertStatus(() -> console.retryDeadLetter(as("PLATFORM_ADMIN"), failed, Source.DELIVERY_WEBHOOK, REASON, null), 409);
        assertStatus(() -> console.retryDeadLetter(as("PLATFORM_ADMIN"), processed, Source.DELIVERY_WEBHOOK, REASON, null), 409);
        assertStatus(() -> console.retryDeadLetter(as("PLATFORM_ADMIN"), UUID.randomUUID(), Source.DELIVERY_WEBHOOK, REASON, null), 404);
        assertThat(database.db.queryForObject("SELECT count(*) FROM payment_schema.admin_investigation_audit", Integer.class)).isZero();

        console.retryDeadLetter(as("PLATFORM_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON, null);
        // A second admin a moment later finds it already retrying.
        assertStatus(() -> console.retryDeadLetter(as("OPERATIONS_ADMIN"), dead, Source.DELIVERY_WEBHOOK, REASON, null), 409);
        assertThat(database.db.queryForObject("SELECT count(*) FROM payment_schema.admin_investigation_audit", Integer.class)).isEqualTo(1);
    }

    private UUID webhook(String provider, String eventId, String status, String error) {
        UUID id = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_webhook_inbox (id, provider_id, provider_event_id, processing_status, "
                + "raw_payload, error_message, attempt_count) VALUES (?, ?, ?, ?, '{\"recipient\":{\"phone\":\"9777777777\"}}'::jsonb, ?, ?)",
            id, provider, eventId, status, error, "DEAD_LETTER".equals(status) ? 10 : 1);
        return id;
    }

    private static Authentication as(String role) {
        return new UsernamePasswordAuthenticationToken(new CravesPrincipal(UUID.randomUUID(), null, Set.of(role)), null, List.of());
    }

    private static void assertStatus(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, int status) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ResponseStatusException.class,
            e -> assertThat(e.getStatusCode().value()).isEqualTo(status));
    }
}
