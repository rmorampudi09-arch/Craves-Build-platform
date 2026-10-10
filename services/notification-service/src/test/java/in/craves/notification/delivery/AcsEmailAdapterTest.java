package in.craves.notification.delivery;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.azure.communication.email.EmailClient;
import com.azure.communication.email.models.EmailMessage;
import com.azure.communication.email.models.EmailSendResult;
import com.azure.communication.email.models.EmailSendStatus;
import com.azure.core.models.ResponseError;
import com.azure.core.util.polling.LongRunningOperationStatus;
import com.azure.core.util.polling.PollResponse;
import com.azure.core.util.polling.SyncPoller;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

class AcsEmailAdapterTest {
    private static final Duration COMPLETION_WAIT = Duration.ofSeconds(60);
    private EmailClient client;
    private SyncPoller<EmailSendResult, EmailSendResult> poller;
    private AuthRecipientEmailResolver resolver;
    private AcsEmailAdapter adapter;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() {
        client = mock(EmailClient.class);
        poller = mock(SyncPoller.class);
        resolver = mock(AuthRecipientEmailResolver.class);
        when(client.beginSend(any(EmailMessage.class))).thenReturn(poller);
        when(resolver.resolve(any())).thenReturn("verified@example.test");
        var properties = new NotificationDeliveryProperties();
        properties.setAcsEmailSenderAddress("sender@example.test");
        properties.setAcsEmailReplyToAddress(" reply@example.test ");
        adapter = new AcsEmailAdapter(client, properties, resolver);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void confirmedSuccessPreservesMessageAndOneProviderSubmission(String role) {
        when(poller.waitForCompletion(COMPLETION_WAIT)).thenReturn(response(
            LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.SUCCEEDED, "operation-success"));
        var item = item(role);
        var result = adapter.send(item);
        assertEquals("azure-communication-services-email", result.provider());
        assertEquals("operation-success", result.providerMessageId());
        var message = ArgumentCaptor.forClass(EmailMessage.class);
        verify(client, times(1)).beginSend(message.capture());
        verify(resolver, times(1)).resolve(item);
        assertEquals("sender@example.test", message.getValue().getSenderAddress());
        assertEquals("verified@example.test", message.getValue().getToRecipients().getFirst().getAddress());
        assertEquals("Saved title", message.getValue().getSubject());
        assertEquals("Saved body", message.getValue().getBodyPlainText());
        assertEquals("reply@example.test", message.getValue().getReplyTo().getFirst().getAddress());
        verify(poller).waitForCompletion(COMPLETION_WAIT);
        verify(poller, never()).waitForCompletion();
    }

    static Stream<Arguments> nonSuccessfulResults() {
        var cases = List.of(
            Arguments.of("failed-with-id", response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, "operation-failed"), "ACS Email operation failed"),
            Arguments.of("poll-failed-result-succeeded", response(LongRunningOperationStatus.FAILED, EmailSendStatus.SUCCEEDED, "operation-failed"), "ACS Email operation failed"),
            Arguments.of("poll-succeeded-result-failed", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.FAILED, "operation-failed"), "ACS Email operation failed"),
            Arguments.of("cancelled", response(LongRunningOperationStatus.USER_CANCELLED, EmailSendStatus.CANCELED, "operation-cancelled"), "ACS Email operation was cancelled"),
            Arguments.of("result-cancelled", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.CANCELED, "operation-cancelled"), "ACS Email operation was cancelled"),
            Arguments.of("running", response(LongRunningOperationStatus.IN_PROGRESS, EmailSendStatus.RUNNING, "operation-running"), "ACS Email outcome is unconfirmed"),
            Arguments.of("poll-still-running", response(LongRunningOperationStatus.IN_PROGRESS, EmailSendStatus.SUCCEEDED, "operation-running"), "ACS Email outcome is unconfirmed"),
            Arguments.of("result-still-running", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.RUNNING, "operation-running"), "ACS Email outcome is unconfirmed"),
            Arguments.of("not-started", response(LongRunningOperationStatus.NOT_STARTED, EmailSendStatus.NOT_STARTED, "operation-not-started"), "ACS Email outcome is unconfirmed"),
            Arguments.of("unknown-poll", response(LongRunningOperationStatus.fromString("FutureTerminal", true), EmailSendStatus.SUCCEEDED, "operation-future"), "ACS Email outcome is unconfirmed"),
            Arguments.of("unknown-result", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.fromString("FutureStatus"), "operation-future"), "ACS Email outcome is unconfirmed"),
            Arguments.of("missing-result-status", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, null, "operation-no-status"), "ACS Email outcome is unconfirmed"),
            Arguments.of("missing-id", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.SUCCEEDED, null), "ACS Email outcome is unconfirmed"),
            Arguments.of("empty-id", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.SUCCEEDED, ""), "ACS Email outcome is unconfirmed"),
            Arguments.of("blank-id", response(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, EmailSendStatus.SUCCEEDED, "  "), "ACS Email outcome is unconfirmed"),
            Arguments.of("missing-result", new PollResponse<EmailSendResult>(LongRunningOperationStatus.SUCCESSFULLY_COMPLETED, null), "ACS Email outcome is unconfirmed"),
            Arguments.of("missing-response", null, "ACS Email outcome is unconfirmed")
        );
        return Stream.of("CUSTOMER", "ADMIN").flatMap(role -> cases.stream().map(test ->
            Arguments.of(role, test.get()[0], test.get()[1], test.get()[2])));
    }

    @ParameterizedTest(name = "{0}: {1}")
    @MethodSource("nonSuccessfulResults")
    void onlyConfirmedSuccessCanReturnDeliveryResult(String role, String label,
        PollResponse<EmailSendResult> response, String expectedMessage) {
        when(poller.waitForCompletion(COMPLETION_WAIT)).thenReturn(response);
        var failure = assertThrows(IllegalStateException.class, () -> adapter.send(item(role)), label);
        assertEquals(expectedMessage, failure.getMessage());
        assertNull(failure.getCause());
        verify(client, times(1)).beginSend(any(EmailMessage.class));
        verify(poller, never()).waitForCompletion();
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void timeoutAndProviderExceptionsAreUnconfirmedAndPrivate(String role) {
        when(poller.waitForCompletion(COMPLETION_WAIT)).thenThrow(new IllegalStateException("recipient=private@example.test provider-body"));
        var failure = assertThrows(IllegalStateException.class, () -> adapter.send(item(role)));
        assertEquals("ACS Email outcome is unconfirmed", failure.getMessage());
        assertNull(failure.getCause());
        verify(client, times(1)).beginSend(any(EmailMessage.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void unavailableCanonicalRecipientNeverSubmitsToTheProvider(String role) {
        var failure = new IllegalStateException("Recipient does not have an available active verified email address");
        when(resolver.resolve(any())).thenThrow(failure);
        assertSame(failure, assertThrows(IllegalStateException.class, () -> adapter.send(item(role))));
        verifyNoInteractions(client, poller);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void submissionExceptionIsPrivateAndDoesNotSubmitAgain(String role) {
        when(client.beginSend(any(EmailMessage.class))).thenThrow(new IllegalStateException("private-provider-request"));
        var failure = assertThrows(IllegalStateException.class, () -> adapter.send(item(role)));
        assertEquals("ACS Email outcome is unconfirmed", failure.getMessage());
        assertNull(failure.getCause());
        verify(client, times(1)).beginSend(any(EmailMessage.class));
        verifyNoInteractions(poller);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"CHEF", "UNKNOWN", "customer", "admin", " CUSTOMER", "ADMIN ", "NOTIFICATION_ADMIN", "CUSTOMER,CHEF"})
    void excludedAudiencesKeepOriginalIdOnlyAndUnboundedHandling(String role) {
        when(poller.waitForCompletion()).thenReturn(response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, "legacy-id"));
        assertEquals("legacy-id", adapter.send(item(role)).providerMessageId());
        verify(poller).waitForCompletion();
        verify(poller, never()).waitForCompletion(any(Duration.class));
        verify(client, times(1)).beginSend(any(EmailMessage.class));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"CHEF", "UNKNOWN"})
    void excludedAudiencesKeepOriginalMissingIdAndExceptionHandling(String role) {
        when(poller.waitForCompletion()).thenReturn(response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, null));
        assertEquals("ACS Email did not return an operation identifier",
            assertThrows(IllegalStateException.class, () -> adapter.send(item(role))).getMessage());
        var legacyException = new IllegalArgumentException("original-legacy-error");
        when(poller.waitForCompletion()).thenThrow(legacyException);
        assertSame(legacyException, assertThrows(IllegalArgumentException.class, () -> adapter.send(item(role))));
    }

    @Test
    void defaultFlagsCreateNoEmailAdapterWorkerOrScheduler() {
        new org.springframework.boot.test.context.runner.ApplicationContextRunner()
            .withUserConfiguration(AcsEmailAdapter.class, NotificationDeliveryWorker.class,
                NotificationDeliverySchedulingConfiguration.class)
            .run(context -> {
                assertNull(context.getStartupFailure());
                assertTrue(context.getBeansOfType(AcsEmailAdapter.class).isEmpty());
                assertTrue(context.getBeansOfType(NotificationDeliveryWorker.class).isEmpty());
                assertTrue(context.getBeansOfType(NotificationDeliverySchedulingConfiguration.class).isEmpty());
            });
    }

    @Test
    void legacyConstructorDoesNotInventAnAudienceFromPayload() {
        var item = new DeliveryWorkItem(UUID.randomUUID(), UUID.randomUUID(), "EMAIL", null, "Title", "Body",
            null, null, Map.of("recipientRole", "CUSTOMER"), 5, 1, UUID.randomUUID());
        assertNull(item.recipientRole());
        when(poller.waitForCompletion()).thenReturn(response(LongRunningOperationStatus.FAILED, EmailSendStatus.FAILED, "legacy-id"));
        assertEquals("legacy-id", adapter.send(item).providerMessageId());
    }

    @ParameterizedTest
    @ValueSource(strings = {"CUSTOMER", "ADMIN"})
    void actualSdkCompletionWaitTimeoutIsUnconfirmed(String role) {
        // Real SDK poller, local callbacks only. Shorten only the test's delegated completion wait.
        var localPoller = SyncPoller.<EmailSendResult, EmailSendResult>createPoller(Duration.ofMillis(1),
            ignored -> response(LongRunningOperationStatus.IN_PROGRESS, EmailSendStatus.RUNNING, "local-operation"),
            ignored -> response(LongRunningOperationStatus.IN_PROGRESS, EmailSendStatus.RUNNING, "local-operation"),
            (ignored, response) -> response.getValue(), ignored -> null);
        var observed = new java.util.concurrent.atomic.AtomicReference<RuntimeException>();
        when(poller.waitForCompletion(COMPLETION_WAIT)).thenAnswer(ignored -> {
            try {
                return localPoller.waitForCompletion(Duration.ofMillis(5));
            } catch (RuntimeException exception) {
                observed.set(exception);
                throw exception;
            }
        });
        var failure = assertThrows(IllegalStateException.class, () -> adapter.send(item(role)));
        assertEquals("ACS Email outcome is unconfirmed", failure.getMessage());
        assertNull(failure.getCause());
        assertInstanceOf(java.util.concurrent.TimeoutException.class, observed.get().getCause());
        verify(client, times(1)).beginSend(any(EmailMessage.class));
    }

    private static PollResponse<EmailSendResult> response(LongRunningOperationStatus poll, EmailSendStatus email, String id) {
        return new PollResponse<>(poll, new EmailSendResult(id, email,
            EmailSendStatus.FAILED.equals(email) ? new ResponseError("private-provider-code", "private@example.test") : null));
    }

    private DeliveryWorkItem item(String role) {
        return new DeliveryWorkItem(UUID.randomUUID(), UUID.randomUUID(), "EMAIL", "ignored@example.test", "Saved title",
            "Saved body", "ORDER", UUID.randomUUID(), Map.of("recipientRole", "CUSTOMER"), 5, 1, UUID.randomUUID(), role);
    }
}
