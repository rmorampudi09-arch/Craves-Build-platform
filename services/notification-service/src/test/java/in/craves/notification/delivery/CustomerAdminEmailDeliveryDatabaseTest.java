package in.craves.notification.delivery;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.azure.communication.email.EmailClient;
import com.azure.communication.email.models.EmailMessage;
import com.azure.communication.email.models.EmailSendResult;
import com.azure.communication.email.models.EmailSendStatus;
import com.azure.core.util.polling.LongRunningOperationStatus;
import com.azure.core.util.polling.PollResponse;
import com.azure.core.util.polling.SyncPoller;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.api.CreateNotificationRequest;
import in.craves.notification.domain.NotificationChannel;
import in.craves.notification.repository.NotificationRepository;
import in.craves.notification.service.ImportantEmailPolicyProperties;
import in.craves.notification.service.NotificationService;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.Arguments;
import java.util.stream.Stream;
import org.springframework.transaction.support.TransactionTemplate;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Real queue/transaction tests; the provider and canonical email lookup are always stubbed. */
@EnabledIfEnvironmentVariable(named = "NOTIFICATION_DELIVERY_TEST_JDBC_URL", matches = ".+")
class CustomerAdminEmailDeliveryDatabaseTest {
    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private NotificationDeliveryRepository deliveries;
    private NotificationService notifications;
    private NotificationDeliveryWorker worker;
    private NotificationDeliveryProperties properties;
    private ImportantEmailPolicyProperties emailPolicy;
    private EmailClient client;
    private SyncPoller<EmailSendResult, EmailSendResult> poller;
    private AuthRecipientEmailResolver resolver;
    private final UUID identity = UUID.randomUUID();

    @BeforeEach
    @SuppressWarnings("unchecked")
    void disposableFixture() {
        String url = System.getenv("NOTIFICATION_DELIVERY_TEST_JDBC_URL");
        assertEquals("YES_DISPOSABLE_NOTIFICATION_DELIVERY_ONLY", System.getenv("NOTIFICATION_DELIVERY_TEST_CONFIRM"));
        assertTrue(url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/notification_delivery_test"));
        DataSource data = new DriverManagerDataSource(url, System.getenv("NOTIFICATION_DELIVERY_TEST_DB_USER"),
            System.getenv("NOTIFICATION_DELIVERY_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(data);
        assertEquals("notification_delivery_test", jdbc.queryForObject("SELECT current_database()", String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS notification_schema CASCADE");
        Flyway flyway = Flyway.configure().dataSource(data).schemas("notification_schema")
            .locations("classpath:db/migration").load();
        assertEquals(7, flyway.migrate().migrationsExecuted);
        flyway.validate();
        assertEquals(0, flyway.migrate().migrationsExecuted);
        context = new AnnotationConfigApplicationContext();
        context.registerBean(DataSource.class, () -> data);
        context.register(TransactionConfiguration.class);
        context.registerBean(NotificationDeliveryRepository.class, () -> new NotificationDeliveryRepository(jdbc));
        emailPolicy = new ImportantEmailPolicyProperties();
        context.registerBean(NotificationService.class, () -> new NotificationService(
            new NotificationRepository(new NamedParameterJdbcTemplate(data), new ObjectMapper()), emailPolicy));
        context.refresh();
        deliveries = context.getBean(NotificationDeliveryRepository.class);
        notifications = context.getBean(NotificationService.class);
        properties = new NotificationDeliveryProperties();
        properties.setEmailEnabled(true);
        properties.setAcsEmailSenderAddress("sender@example.test");
        properties.setMaxAttempts(3);
        client = mock(EmailClient.class);
        poller = mock(SyncPoller.class);
        resolver = mock(AuthRecipientEmailResolver.class);
        when(resolver.resolve(any())).thenReturn("verified@example.test");
        when(client.beginSend(any(EmailMessage.class))).thenReturn(poller);
        var providers = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
        providers.registerSingleton("emailAdapter", new AcsEmailAdapter(client, properties, resolver));
        worker = new NotificationDeliveryWorker(properties, deliveries, providers.getBeanProvider(FcmPushAdapter.class),
            providers.getBeanProvider(AcsEmailAdapter.class));
    }

    @AfterEach
    void closeContext() {
        if (context != null) context.close();
    }

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement
    static class TransactionConfiguration {
        @Bean DataSourceTransactionManager transactionManager(DataSource data) {
            return new DataSourceTransactionManager(data);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void failedTerminalOperationWithIdIsRetriedInsteadOfMarkedSent(String role) {
        UUID id = enqueue(role, NotificationChannel.EMAIL, "failed-" + role);
        // The real SDK poller regards FAILED as complete; an operation ID alone is not success.
        var terminal = new PollResponse<>(LongRunningOperationStatus.FAILED,
            new EmailSendResult("operation-failed", EmailSendStatus.FAILED, null));
        var localPoller = SyncPoller.<EmailSendResult, EmailSendResult>createPoller(Duration.ofMillis(1),
            ignored -> terminal, ignored -> terminal, (ignored, response) -> response.getValue(),
            ignored -> terminal.getValue());
        when(client.beginSend(any(EmailMessage.class))).thenReturn(localPoller);
        worker.deliver();
        assertEquals("FAILED", status(id));
        assertEquals(1, value(id, "attempt_count", Integer.class));
        assertNull(value(id, "sent_at", java.sql.Timestamp.class));
        assertNull(value(id, "provider_message_id", String.class));
        assertNull(value(id, "lock_token", UUID.class));
        assertTrue(jdbc.queryForObject("SELECT next_attempt_at > now() FROM notification_schema.notification_request WHERE id=?", Boolean.class, id));
        assertEquals("FAILED", jdbc.queryForObject("SELECT status FROM notification_schema.notification_delivery_attempt WHERE request_id=?", String.class, id));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_schema.channel_delivery_dead_letter WHERE notification_request_id=?", Integer.class, id));
        verify(client, times(1)).beginSend(any(EmailMessage.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void successfulOperationHasOneSentAttemptAndIsNeverResent(String role) {
        UUID id = enqueue(role, NotificationChannel.EMAIL, "success-" + role);
        String beforePayload = value(id, "payload::text", String.class);
        response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.SUCCEEDED, "operation-success");
        worker.deliver();
        worker.deliver();
        assertEquals("SENT", status(id));
        assertEquals(1, value(id, "attempt_count", Integer.class));
        assertNotNull(value(id, "sent_at", java.sql.Timestamp.class));
        assertEquals("operation-success", value(id, "provider_message_id", String.class));
        assertNull(value(id, "lock_token", UUID.class));
        assertNull(value(id, "locked_at", java.sql.Timestamp.class));
        assertNull(value(id, "last_error", String.class));
        assertEquals(beforePayload, value(id, "payload::text", String.class));
        assertEquals("ORDER_CREATED_IN_APP", value(id, "template_code", String.class));
        assertEquals("Saved title", value(id, "title", String.class));
        assertEquals("Saved body", value(id, "body", String.class));
        assertEquals("ignored@example.test", value(id, "delivery_address", String.class));
        assertEquals("SENT", jdbc.queryForObject("SELECT status FROM notification_schema.notification_delivery_attempt WHERE request_id=?", String.class, id));
        verify(client, times(1)).beginSend(any(EmailMessage.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void dueRetryCanSucceedWithoutChangingTheSavedMessage(String role) {
        UUID id = enqueue(role, NotificationChannel.EMAIL, "retry-" + role);
        response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, "failed-operation");
        worker.deliver();
        assertEquals("FAILED", status(id));
        worker.deliver(); // Existing backoff prevents an immediate repeat.
        verify(client, times(1)).beginSend(any(EmailMessage.class));
        due(id);
        response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.SUCCEEDED, "successful-retry");
        worker.deliver();
        assertEquals("SENT", status(id));
        assertEquals(2, value(id, "attempt_count", Integer.class));
        assertEquals("successful-retry", value(id, "provider_message_id", String.class));
        assertEquals(java.util.List.of("FAILED", "SENT"), jdbc.queryForList(
            "SELECT status FROM notification_schema.notification_delivery_attempt WHERE request_id=? ORDER BY attempt_number", String.class, id));
        verify(client, times(2)).beginSend(any(EmailMessage.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void retryBudgetEndsInDeadLetterWithoutSentEvidence(String role) {
        UUID id = enqueue(role, NotificationChannel.EMAIL, "exhaust-" + role);
        response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, "failed-operation");
        for (int attempt = 1; attempt <= 3; attempt++) {
            due(id);
            worker.deliver();
            assertEquals(attempt < 3 ? "FAILED" : "DEAD_LETTER", status(id));
            assertEquals(attempt, value(id, "attempt_count", Integer.class));
            assertNull(value(id, "sent_at", java.sql.Timestamp.class));
            assertNull(value(id, "provider_message_id", String.class));
            assertNull(value(id, "lock_token", UUID.class));
        }
        worker.deliver();
        assertEquals("ACS Email operation failed", value(id, "last_error", String.class));
        assertEquals(java.util.List.of("FAILED", "FAILED", "DEAD_LETTER"), jdbc.queryForList(
            "SELECT status FROM notification_schema.notification_delivery_attempt WHERE request_id=? ORDER BY attempt_number", String.class, id));
        assertEquals(3, jdbc.queryForObject("SELECT attempt_count FROM notification_schema.channel_delivery_dead_letter WHERE notification_request_id=?", Integer.class, id));
        verify(client, times(3)).beginSend(any(EmailMessage.class));
    }

    static Stream<Arguments> unconfirmedOutcomes() {
        return Stream.of("CUSTOMER", "ADMIN").flatMap(role ->
            Stream.of("missing-response", "missing-result", "running", "unknown", "timeout")
                .map(outcome -> Arguments.of(role, outcome)));
    }

    @ParameterizedTest(name = "{0}: {1}")
    @MethodSource("unconfirmedOutcomes")
    void unconfirmedOutcomesUseExistingFailureBudgetAndNeverClaimSent(String role, String outcome) {
        UUID id = enqueue(role, NotificationChannel.EMAIL, "uncertain-" + role + outcome);
        switch (outcome) {
            case "missing-response" -> when(poller.waitForCompletion(any(Duration.class))).thenReturn(null);
            case "missing-result" -> when(poller.waitForCompletion(any(Duration.class)))
                .thenReturn(new PollResponse<>(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, null));
            case "running" -> response(LongRunningOperationStatus.IN_PROGRESS, EmailSendStatus.RUNNING, "pending-operation");
            case "unknown" -> response(LongRunningOperationStatus.fromString("FutureStatus", true), EmailSendStatus.fromString("FutureStatus"), "unknown-operation");
            case "timeout" -> when(poller.waitForCompletion(any(Duration.class)))
                .thenThrow(new IllegalStateException("private@example.test upstream-request-body"));
            default -> fail("unexpected fixture outcome");
        }
        worker.deliver();
        assertEquals("FAILED", status(id));
        assertEquals("ACS Email outcome is unconfirmed", value(id, "last_error", String.class));
        assertNull(value(id, "sent_at", java.sql.Timestamp.class));
        assertNull(value(id, "provider_message_id", String.class));
        assertEquals("ACS Email outcome is unconfirmed", jdbc.queryForObject(
            "SELECT error_message FROM notification_schema.notification_delivery_attempt WHERE request_id=?", String.class, id));
        jdbc.update("UPDATE notification_schema.notification_request SET attempt_count=2 WHERE id=?", id);
        due(id);
        worker.deliver();
        assertEquals("DEAD_LETTER", status(id));
        assertNull(value(id, "sent_at", java.sql.Timestamp.class));
        assertEquals("ACS Email outcome is unconfirmed", jdbc.queryForObject(
            "SELECT final_error_message FROM notification_schema.channel_delivery_dead_letter WHERE notification_request_id=?", String.class, id));
        verify(client, times(2)).beginSend(any(EmailMessage.class));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"CHEF", "UNKNOWN", "customer", "admin", " CUSTOMER", "ADMIN ", "NOTIFICATION_ADMIN", "CUSTOMER,CHEF"})
    void excludedStoredRolesKeepOriginalBehaviorEvenWhenPayloadClaimsCustomer(String role) {
        UUID id = enqueue(role, NotificationChannel.EMAIL, "legacy-" + UUID.randomUUID());
        response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, "legacy-operation");
        worker.deliver();
        assertEquals("SENT", status(id)); // Deliberate scope exclusion; this is not a claim that legacy handling is correct.
        assertEquals("legacy-operation", value(id, "provider_message_id", String.class));
        verify(poller).waitForCompletion();
        verify(poller, never()).waitForCompletion(any(Duration.class));
        var item = org.mockito.ArgumentCaptor.forClass(NotificationDeliveryModels.DeliveryWorkItem.class);
        verify(resolver).resolve(item.capture());
        assertEquals(role, item.getValue().recipientRole());
    }

    @Test
    void oneIdentityWithCustomerAdminChefAndUnknownRequestsKeepsEachSavedAudience() {
        UUID customer = enqueue("CUSTOMER", NotificationChannel.EMAIL, "dual-customer");
        UUID admin = enqueue("ADMIN", NotificationChannel.EMAIL, "dual-admin");
        UUID chef = enqueue("CHEF", NotificationChannel.EMAIL, "dual-chef");
        UUID unknown = enqueue(null, NotificationChannel.EMAIL, "dual-unknown");
        response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, "same-provider-outcome");
        worker.deliver();
        assertEquals("FAILED", status(customer));
        assertEquals("FAILED", status(admin));
        assertEquals("SENT", status(chef));
        assertEquals("SENT", status(unknown));
        verify(client, times(4)).beginSend(any(EmailMessage.class));
        verify(poller, times(2)).waitForCompletion(Duration.ofSeconds(60));
        verify(poller, times(2)).waitForCompletion();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"CUSTOMER", "ADMIN", "CHEF", "UNKNOWN"})
    void importantEmailCopyPreservesAudienceAndDuplicateCreateCannotRewriteIt(String role) {
        emailPolicy.setEnabled(true);
        String key = "fanout-" + UUID.randomUUID();
        UUID original = enqueue(role, NotificationChannel.IN_APP, key);
        notifications.create(request("CHEF", NotificationChannel.IN_APP, key));
        UUID email = jdbc.queryForObject("SELECT id FROM notification_schema.notification_request WHERE request_key=?", UUID.class, key + "-email");
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM notification_schema.notification_request", Integer.class));
        assertEquals("SENT", status(original));
        assertEquals("PENDING", status(email));
        assertEquals(role, value(email, "recipient_role", String.class));
        assertEquals("ORDER_CREATED_EMAIL", value(email, "template_code", String.class));
        assertEquals(value(original, "payload::text", String.class), value(email, "payload::text", String.class));
        var claim = deliveries.claim("EMAIL", 10, 3, 5).getFirst();
        assertEquals(role, claim.recipientRole());
        assertEquals(identity, claim.recipientIdentityId());
        assertEquals(email, claim.requestId());
    }

    @Test
    void disabledEmailAndDisabledPreferenceLeaveQueueUntouched() {
        UUID id = enqueue("CUSTOMER", NotificationChannel.EMAIL, "disabled");
        properties.setEmailEnabled(false);
        worker.deliver();
        assertEquals("PENDING", status(id));
        assertEquals(0, value(id, "attempt_count", Integer.class));
        properties.setEmailEnabled(true);
        deliveries.setPreference(identity, "EMAIL", false);
        worker.deliver();
        assertEquals("PENDING", status(id));
        assertEquals(0, value(id, "attempt_count", Integer.class));
        verifyNoInteractions(client, resolver);
        deliveries.setPreference(identity, "EMAIL", true);
        response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.SUCCEEDED, "enabled-operation");
        worker.deliver();
        assertEquals("SENT", status(id));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void historicalSentAndDeadLetterRowsAreNeverReopenedOrResent(String role) {
        UUID sent = enqueue(role, NotificationChannel.EMAIL, "old-sent-" + role);
        UUID dead = enqueue(role, NotificationChannel.EMAIL, "old-dead-" + role);
        jdbc.update("UPDATE notification_schema.notification_request SET status='SENT',sent_at=now()-interval '1 day',provider_message_id='old-operation',attempt_count=1 WHERE id=?", sent);
        jdbc.update("UPDATE notification_schema.notification_request SET status='DEAD_LETTER',attempt_count=3 WHERE id=?", dead);
        String before = jdbc.queryForObject("SELECT row_to_json(r)::text FROM notification_schema.notification_request r WHERE id=?", String.class, sent);
        worker.deliver();
        assertEquals(before, jdbc.queryForObject("SELECT row_to_json(r)::text FROM notification_schema.notification_request r WHERE id=?", String.class, sent));
        assertEquals("DEAD_LETTER", status(dead));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_schema.notification_delivery_attempt", Integer.class));
        verifyNoInteractions(client, resolver);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void staleWorkerCannotPublishEitherOutcomeOverANewerClaim(String role) {
        UUID id = enqueue(role, NotificationChannel.EMAIL, "fenced-" + role);
        var old = deliveries.claim("EMAIL", 1, 3, 5).getFirst();
        jdbc.update("UPDATE notification_schema.notification_request SET locked_at=now()-interval '6 minutes' WHERE id=?", id);
        var current = deliveries.claim("EMAIL", 1, 3, 5).getFirst();
        assertNotEquals(old.lockToken(), current.lockToken());
        assertEquals(role, current.recipientRole());
        deliveries.markSent(old, new NotificationDeliveryModels.DeliveryResult("stub", "stale-id"));
        deliveries.markFailure(old, 3, 30, "stub", new IllegalStateException("stale-error"));
        assertEquals("PROCESSING", status(id));
        assertEquals(current.lockToken(), value(id, "lock_token", UUID.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_schema.notification_delivery_attempt", Integer.class));
        deliveries.markFailure(current, 3, 30, "stub", new IllegalStateException("current-error"));
        assertEquals("FAILED", status(id));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM notification_schema.notification_delivery_attempt", Integer.class));
    }

    @Test
    void existingOutcomeAndAttemptTransactionsStillRollBackTogether() {
        UUID id = enqueue("CUSTOMER", NotificationChannel.EMAIL, "atomic");
        var item = deliveries.claim("EMAIL", 1, 3, 5).getFirst();
        var transaction = new TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        assertThrows(IllegalStateException.class, () -> transaction.executeWithoutResult(ignored -> {
            deliveries.markSent(item, new NotificationDeliveryModels.DeliveryResult("stub", "rolled-back"));
            throw new IllegalStateException("rollback");
        }));
        assertEquals("PROCESSING", status(id));
        assertNull(value(id, "sent_at", java.sql.Timestamp.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_schema.notification_delivery_attempt", Integer.class));
        assertThrows(IllegalStateException.class, () -> transaction.executeWithoutResult(ignored -> {
            deliveries.markFailure(item, 1, 30, "stub", new IllegalStateException("rolled-back-failure"));
            throw new IllegalStateException("rollback");
        }));
        assertEquals("PROCESSING", status(id));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_schema.notification_delivery_attempt", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM notification_schema.channel_delivery_dead_letter", Integer.class));
    }

    private void due(UUID id) {
        jdbc.update("UPDATE notification_schema.notification_request SET next_attempt_at=now()-interval '1 second' WHERE id=?", id);
    }

    private UUID enqueue(String role, NotificationChannel channel, String key) {
        return notifications.create(request(role, channel, key)).id();
    }

    private CreateNotificationRequest request(String role, NotificationChannel channel, String key) {
        return new CreateNotificationRequest(key, "cp12-disposable-test", "ORDER_CREATED", identity, role,
            channel, "ORDER_CREATED_IN_APP", "ignored@example.test", "Saved title", "Saved body", "ORDER", UUID.randomUUID(),
            Map.of("recipientRole", "CUSTOMER", "unchanged", "payload"), 5);
    }

    private void response(LongRunningOperationStatus pollStatus, EmailSendStatus emailStatus, String operationId) {
        var result = new EmailSendResult(operationId, emailStatus, null);
        var response = new PollResponse<>(pollStatus, result);
        when(poller.waitForCompletion()).thenReturn(response);
        when(poller.waitForCompletion(any(Duration.class))).thenReturn(response);
    }

    private String status(UUID id) { return value(id, "status", String.class); }
    private <T> T value(UUID id, String column, Class<T> type) {
        return jdbc.queryForObject("SELECT " + column + " FROM notification_schema.notification_request WHERE id=?", type, id);
    }
}
