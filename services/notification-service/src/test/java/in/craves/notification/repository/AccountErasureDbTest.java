package in.craves.notification.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.notification.erasure.AccountErasureService;
import in.craves.notification.erasure.AccountErasureService.Scope;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Real PostgreSQL. Drops notification_schema, so it only runs against the disposable
 * pdf_module_test database that CI already provides for the other notification DB tests.
 */
@EnabledIfEnvironmentVariable(named = "DOCUMENT_TEST_JDBC_URL", matches = ".+")
class AccountErasureDbTest {
    private static final String NS = "notification_schema.";
    private static final String BODY = "Hello Ravi, 12 Lake Road";
    private JdbcTemplate jdbc;
    private AccountErasureService service;
    private final UUID me = UUID.randomUUID();
    private final UUID someoneElse = UUID.randomUUID();
    private final UUID requestId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        String url = System.getenv("DOCUMENT_TEST_JDBC_URL");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") && url.endsWith("/pdf_module_test"),
            "Refusing any database except the disposable local pdf_module_test");
        var data = new DriverManagerDataSource(
            url, System.getenv("DOCUMENT_TEST_DB_USER"), System.getenv("DOCUMENT_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(data);
        jdbc.execute("DROP SCHEMA IF EXISTS notification_schema CASCADE");
        jdbc.execute("DROP TABLE IF EXISTS public.flyway_schema_history");
        Flyway.configure().dataSource(data).locations("classpath:db/migration").load().migrate();
        service = new AccountErasureService(jdbc);

        for (UUID identity : List.of(me, someoneElse)) {
            notice(identity, "CUSTOMER");
            notice(identity, "CHEF");
            device(identity, "customer");
            jdbc.update("INSERT INTO " + NS + "notification_preference(recipient_identity_id, channel, enabled) VALUES (?, 'PUSH', false)", identity);
            jdbc.update("INSERT INTO " + NS + "notification_preference(recipient_identity_id, channel, enabled) VALUES (?, 'EMAIL', true)", identity);
        }
        notice(me, "chef"); // old row with a lower-case role
        notice(me, null); // old row without a role
        device(me, "rider");
    }

    private void notice(UUID identity, String role) {
        jdbc.update("""
            INSERT INTO notification_schema.in_app_notification(
                id, recipient_identity_id, recipient_role, title, body, notification_type)
            VALUES (?, ?, ?, 'title', 'body', 'TEST')
            """, UUID.randomUUID(), identity, role);
    }

    private void device(UUID identity, String app) {
        UUID token = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO notification_schema.push_device_registration(
                id, recipient_identity_id, platform, device_token, token_hash, app)
            VALUES (?, ?, 'ANDROID', ?, ?, ?)
            """, UUID.randomUUID(), identity, token.toString(), token.toString().replace("-", "").repeat(2), app);
    }

    private UUID request(UUID identity, String role, String status) {
        UUID id = UUID.randomUUID();
        boolean processing = "PROCESSING".equals(status);
        jdbc.update("""
            INSERT INTO notification_schema.notification_request(
                id, request_key, source_service, event_type, recipient_identity_id, recipient_role, channel,
                delivery_address, title, body, payload, status, lock_token, locked_at, next_attempt_at)
            VALUES (?, ?, 'order', 'ORDER_PLACED', ?, ?, 'EMAIL', 'ravi@example.com', 'Your order',
                    ?, '{"name":"Ravi"}'::jsonb, ?, ?, ?, ?)
            """, id, "key-" + id, identity, role, BODY, status,
            processing ? UUID.randomUUID() : null, processing ? Timestamp.from(Instant.now()) : null,
            "SENT".equals(status) ? null : Timestamp.from(Instant.now()));
        return id;
    }

    private int count(String table, String column, UUID identity) {
        return jdbc.queryForObject("SELECT count(*) FROM " + NS + table + " WHERE " + column + " = ?", Integer.class, identity);
    }

    private List<String> roles(UUID identity) {
        return jdbc.queryForList("SELECT coalesce(recipient_role, '-') FROM " + NS
            + "in_app_notification WHERE recipient_identity_id = ? ORDER BY 1", String.class, identity);
    }

    private Map<String, Object> requestRow(UUID id) {
        return jdbc.queryForMap("SELECT body, payload::text AS payload, delivery_address, status, lock_token, title FROM "
            + NS + "notification_request WHERE id = ?", id);
    }

    @Test
    void customerScopeKeepsChefNotices() {
        Map<String, Integer> counts = service.erase(me, Scope.CUSTOMER, requestId);

        assertThat(counts.get("in_app_notification")).isEqualTo(1);
        assertThat(roles(me)).containsExactlyInAnyOrder("CHEF", "chef", "-");
        assertThat(roles(someoneElse)).containsExactlyInAnyOrder("CHEF", "CUSTOMER");
        // devices and preferences belong to the whole account: only ALL removes them
        assertThat(count("push_device_registration", "recipient_identity_id", me)).isEqualTo(2);
        assertThat(count("notification_preference", "recipient_identity_id", me)).isEqualTo(2);
        assertThat(counts).doesNotContainKeys("push_device_registration", "notification_preference");

        assertThat(service.erase(me, Scope.CHEF, requestId).get("in_app_notification")).isEqualTo(2); // CHEF and chef
        assertThat(roles(me)).containsExactly("-");
    }

    @Test
    void customerScopeBlanksOnlyCustomerRequests() {
        UUID customerSent = request(me, "CUSTOMER", "SENT");
        UUID chefSent = request(me, "CHEF", "SENT");
        UUID noRoleSent = request(me, null, "SENT");
        UUID others = request(someoneElse, "CUSTOMER", "SENT");

        Map<String, Integer> counts = service.erase(me, Scope.CUSTOMER, requestId);

        assertThat(counts.get("notification_request")).isEqualTo(1);
        assertThat(requestRow(customerSent)).containsEntry("body", "").containsEntry("payload", "{}")
            .containsEntry("delivery_address", null).containsEntry("status", "SENT");
        for (UUID untouched : List.of(chefSent, noRoleSent, others)) {
            assertThat(requestRow(untouched)).containsEntry("body", BODY).containsEntry("delivery_address", "ravi@example.com");
        }

        service.erase(me, Scope.ALL, requestId); // ALL reaches the other role and the role-less row, never another identity
        assertThat(requestRow(chefSent)).containsEntry("body", "");
        assertThat(requestRow(noRoleSent)).containsEntry("body", "").containsEntry("delivery_address", null);
        assertThat(requestRow(others)).containsEntry("body", BODY);
    }

    @Test
    void allScopeRemovesDevicesPreferencesAndBodies() {
        UUID sent = request(me, "CUSTOMER", "SENT");

        Map<String, Integer> counts = service.erase(me, Scope.ALL, requestId);

        assertThat(counts).containsEntry("in_app_notification", 4).containsEntry("notification_preference", 2)
            .containsEntry("push_device_registration", 1).containsEntry("notification_request", 1);
        assertThat(count("in_app_notification", "recipient_identity_id", me)).isZero();
        assertThat(count("notification_preference", "recipient_identity_id", me)).isZero();
        assertThat(requestRow(sent)).containsEntry("body", "").containsEntry("payload", "{}")
            .containsEntry("delivery_address", null).containsEntry("title", "Your order");
        // the rider app token is not the customer/chef account's: ALL keeps it, and everything of the other identity
        assertThat(jdbc.queryForList("SELECT app FROM " + NS + "push_device_registration WHERE recipient_identity_id = ?", String.class, me))
            .containsExactly("rider");
        assertThat(count("in_app_notification", "recipient_identity_id", someoneElse)).isEqualTo(2);
        assertThat(count("notification_preference", "recipient_identity_id", someoneElse)).isEqualTo(2);
        assertThat(count("push_device_registration", "recipient_identity_id", someoneElse)).isEqualTo(1);
    }

    @Test
    void unsentRequestIsStoppedNotSentBlank() {
        UUID pending = request(me, "CUSTOMER", "PENDING");
        UUID failed = request(me, "CUSTOMER", "FAILED");
        UUID processing = request(me, "CUSTOMER", "PROCESSING");
        UUID deadLetter = request(me, "CUSTOMER", "DEAD_LETTER");
        UUID sent = request(me, "CUSTOMER", "SENT");
        UUID chefPending = request(me, "CHEF", "PENDING");

        Map<String, Integer> counts = service.erase(me, Scope.CUSTOMER, requestId);

        assertThat(counts).containsEntry("notification_request_stopped", 4).containsEntry("notification_request", 5);
        for (UUID id : List.of(pending, failed, processing, deadLetter)) {
            assertThat(requestRow(id)).containsEntry("status", "SKIPPED").containsEntry("body", "").containsEntry("lock_token", null);
        }
        assertThat(requestRow(sent)).containsEntry("status", "SENT");
        assertThat(requestRow(chefPending)).containsEntry("status", "PENDING").containsEntry("body", BODY);
        // nothing the delivery worker or an admin requeue could pick up is left for this role
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + NS + "notification_request WHERE recipient_identity_id = ? "
            + "AND recipient_role = 'CUSTOMER' AND status IN ('PENDING','PROCESSING','FAILED','DEAD_LETTER')", Integer.class, me)).isZero();
    }

    @Test
    void pdfDocumentsAreUntouched() {
        UUID document = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO notification_schema.pdf_document(
                id, owner_identity_id, request_key, request_hash, document_type, source_reference, currency, timezone,
                template_version, snapshot, snapshot_hash, status, blob_key, pdf_hash, byte_count, ready_at)
            VALUES (?, ?, 'receipt-1', repeat('a', 64), 'PAYMENT_RECEIPT', 'order-1', 'INR', 'Asia/Kolkata', 'v1',
                    '{"customer":"Ravi"}', repeat('b', 64), 'READY', 'blob/1.pdf', repeat('c', 64), 1000, now())
            """, document, me);
        jdbc.update("INSERT INTO notification_schema.pdf_document_audit(document_id, actor_identity_id, event_type) VALUES (?, ?, 'ISSUED')", document, me);
        String before = pdfRow(document);

        service.erase(me, Scope.ALL, requestId); // a READY row is behind an immutability trigger: any write would raise

        assertThat(pdfRow(document)).isEqualTo(before);
        assertThat(count("pdf_document_audit", "document_id", document)).isEqualTo(1);
    }

    private String pdfRow(UUID document) {
        return jdbc.queryForObject("SELECT to_jsonb(t)::text FROM " + NS + "pdf_document t WHERE id = ?", String.class, document);
    }

    @Test
    void eraseTwiceIsDoneWithZeroCounts() {
        request(me, "CUSTOMER", "PENDING");
        request(me, "CHEF", "SENT");
        for (Scope scope : List.of(Scope.CUSTOMER, Scope.CHEF, Scope.ALL)) {
            service.erase(me, scope, requestId);
            assertThat(service.erase(me, scope, requestId).values()).isNotEmpty().containsOnly(0);
        }
        assertThat(count("in_app_notification", "recipient_identity_id", me)).isZero();
    }
}
