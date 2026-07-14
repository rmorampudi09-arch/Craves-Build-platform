package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
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
            commands, deliveryJobs, router, completion, properties
        );

        DeliveryCommandMessage message = command();
        CommandRecord claimed = new CommandRecord(
            message.commandId(), message.chefSubOrderId(), message.orderId(),
            "PROCESSING", 2, message, 7001L, "delivery-command:test"
        );
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
