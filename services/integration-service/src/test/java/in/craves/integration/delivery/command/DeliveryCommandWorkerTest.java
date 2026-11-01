package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandDeferredException;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryCreateReconciliationPendingException;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryCommandWorkerTest {

    @Test
    void completesRedeliveredCommandWithoutCallingProviderWhenJobAlreadyExists() {
        DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
        DeliveryJobRepository deliveryJobs = mock(DeliveryJobRepository.class);
        DeliveryProviderRouter router = mock(DeliveryProviderRouter.class);
        DeliveryCommandCompletionService completion = mock(DeliveryCommandCompletionService.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setMaxDeliveryAttempts(5);
        DeliveryCommandWorker worker = new DeliveryCommandWorker(
            commands, deliveryJobs, router, completion, properties, retryProperties()
        );

        DeliveryCommandMessage message = command();
        CommandRecord claimed = commandRecord(message, "PROCESSING");
        UUID existingJobId = UUID.randomUUID();
        when(commands.claim(message.commandId(), 5)).thenReturn(Optional.of(claimed));
        when(deliveryJobs.findIdByChefSubOrderId(message.chefSubOrderId()))
            .thenReturn(Optional.of(existingJobId));

        var receipt = worker.process(message);

        assertThat(receipt.deliveryJobId()).isEqualTo(existingJobId);
        assertThat(receipt.duplicate()).isTrue();
        assertThat(receipt.providerId()).isEqualTo("ALREADY_COMPLETED");
        verify(commands).markCompleted(message.commandId());
        verifyNoInteractions(router, completion);
    }

    @Test
    void storesUncertainCreateForReconciliationWithoutRetryingTheProvider() {
        DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
        DeliveryJobRepository deliveryJobs = mock(DeliveryJobRepository.class);
        DeliveryProviderRouter router = mock(DeliveryProviderRouter.class);
        DeliveryCommandCompletionService completion = mock(DeliveryCommandCompletionService.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setMaxDeliveryAttempts(5);
        DeliveryCommandWorker worker = new DeliveryCommandWorker(
            commands, deliveryJobs, router, completion, properties, retryProperties()
        );

        DeliveryCommandMessage message = command();
        CommandRecord claimed = commandRecord(message, "PROCESSING");
        Instant attemptedAt = Instant.parse("2026-07-24T02:00:00Z");
        String clientReference = "CRV-1234567890123456789012345678";
        DeliveryCreateReconciliationPendingException uncertain =
            new DeliveryCreateReconciliationPendingException(
                "borzo",
                clientReference,
                attemptedAt,
                "Provider create response was not received",
                null
            );

        when(commands.claim(message.commandId(), 5)).thenReturn(Optional.of(claimed));
        when(deliveryJobs.findIdByChefSubOrderId(message.chefSubOrderId()))
            .thenReturn(Optional.empty());
        when(router.route(message)).thenThrow(uncertain);
        when(commands.markReconciliationPending(
            message.commandId(), "borzo", clientReference, attemptedAt,
            "Provider create response was not received"
        )).thenReturn(true);

        var receipt = worker.process(message);

        assertThat(receipt.deliveryJobId()).isNull();
        assertThat(receipt.providerId()).isEqualTo("RECONCILIATION_PENDING");
        verify(commands).markReconciliationPending(
            message.commandId(), "borzo", clientReference, attemptedAt,
            "Provider create response was not received"
        );
        verifyNoInteractions(completion);
    }

    @Test
    void defersWhenNoProviderIsTemporarilyAvailableWithoutDeadLettering() {
        DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
        DeliveryJobRepository deliveryJobs = mock(DeliveryJobRepository.class);
        DeliveryProviderRouter router = mock(DeliveryProviderRouter.class);
        DeliveryCommandCompletionService completion = mock(DeliveryCommandCompletionService.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setMaxDeliveryAttempts(5);
        DeliveryCommandRetryProperties retry = retryProperties();
        DeliveryCommandWorker worker = new DeliveryCommandWorker(
            commands, deliveryJobs, router, completion, properties, retry
        );

        DeliveryCommandMessage message = command();
        CommandRecord claimed = commandRecord(message, "PROCESSING");
        when(commands.claim(message.commandId(), 5)).thenReturn(Optional.of(claimed));
        when(deliveryJobs.findIdByChefSubOrderId(message.chefSubOrderId()))
            .thenReturn(Optional.empty());
        when(router.route(message)).thenThrow(
            new DeliveryProviderTemporarilyUnavailableException(
                "No active delivery providers are configured"
            )
        );
        when(commands.markProviderWait(
            org.mockito.ArgumentMatchers.eq(message.commandId()),
            any(Instant.class),
            org.mockito.ArgumentMatchers.eq("No active delivery providers are configured")
        )).thenReturn(true);

        assertThatThrownBy(() -> worker.process(message))
            .isInstanceOf(DeliveryCommandDeferredException.class)
            .hasMessage("No active delivery providers are configured");

        verify(commands).markProviderWait(
            org.mockito.ArgumentMatchers.eq(message.commandId()),
            any(Instant.class),
            org.mockito.ArgumentMatchers.eq("No active delivery providers are configured")
        );
        verify(commands, never()).markFailed(any(), any());
        verify(commands, never()).markDeadLetter(any(), any());
        verifyNoInteractions(completion);
    }

    /** R16 item 11: an order cancelled before its command ran offers no rider and books no courier, and no copy dead-letters. */
    @Test
    void aCancelledOrdersCommandOffersNobodyBooksNobodyAndItsLaterCopiesComplete() {
        DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
        DeliveryJobRepository deliveryJobs = mock(DeliveryJobRepository.class);
        DeliveryProviderRouter router = mock(DeliveryProviderRouter.class);
        DeliveryCommandCompletionService completion = mock(DeliveryCommandCompletionService.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setMaxDeliveryAttempts(5);
        DeliveryCommandWorker worker = new DeliveryCommandWorker(
            commands, deliveryJobs, router, completion, properties, retryProperties()
        );
        DeliveryCommandMessage message = command();
        when(commands.claim(message.commandId(), 5)).thenReturn(Optional.of(commandRecord(message, "PROCESSING")));
        when(deliveryJobs.findIdByChefSubOrderId(message.chefSubOrderId())).thenReturn(Optional.empty());
        when(commands.orderCancelled(message.chefSubOrderId())).thenReturn(true);

        var receipt = worker.process(message);

        assertThat(receipt.providerId()).isEqualTo("ORDER_CANCELLED");
        assertThat(receipt.deliveryJobId()).isNull();
        verify(commands).markDeadLetter(message.commandId(), "ORDER_CANCELLED");
        verifyNoInteractions(router, completion);

        // A ready tap or a decline sends another copy: it finds the command done, without a Service Bus dead letter.
        when(commands.claim(message.commandId(), 5)).thenReturn(Optional.empty());
        when(commands.findById(message.commandId())).thenReturn(Optional.of(commandRecord(message, "DEAD_LETTER")));

        assertThat(worker.process(message).providerId()).isEqualTo("ORDER_CANCELLED");
        verify(commands).markDeadLetter(any(), any());
        verifyNoInteractions(router, completion);
    }

    private static DeliveryCommandRetryProperties retryProperties() {
        DeliveryCommandRetryProperties retry = new DeliveryCommandRetryProperties();
        retry.setBaseSeconds(30);
        retry.setMaxSeconds(600);
        retry.setClaimContentionSeconds(10);
        return retry;
    }

    private static CommandRecord commandRecord(DeliveryCommandMessage message, String status) {
        return new CommandRecord(
            message.commandId(),
            message.chefSubOrderId(),
            message.orderId(),
            status,
            2,
            message,
            7001L,
            "delivery-command:test",
            null,
            null,
            null,
            0,
            0,
            null,
            null
        );
    }

    private static DeliveryCommandMessage command() {
        UUID orderId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();
        QuoteRequest quoteRequest = new QuoteRequest(
            "Packaged food",
            2000,
            true,
            new Stop(
                "Madhapur, Hyderabad", "Chef", "919999999991",
                new BigDecimal("17.4483"), new BigDecimal("78.3915"),
                null, null, "Pickup"
            ),
            new Stop(
                "Gachibowli, Hyderabad", "Customer", "919999999992",
                new BigDecimal("17.4401"), new BigDecimal("78.3489"),
                null, null, "Dropoff"
            )
        );
        return new DeliveryCommandMessage(
            UUID.randomUUID(),
            UUID.randomUUID(),
            orderId,
            orderId,
            subOrderId,
            Instant.now().plusSeconds(1800),
            Instant.now(),
            subOrderId.toString(),
            4.6,
            "Madhapur",
            19,
            1,
            quoteRequest
        );
    }
}
