package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.command.DeliveryCommandModels.ChefAcceptedOrderData;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandModels.OrderReadyForPickupData;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class DeliveryCommandSchedulerTest {

    @Test
    void schedulesTenMinutesBeforeReadyAtAndPersistsIntelligenceContext() {
        DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
        DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setLeadTimeMinutes(10);
        Instant now = Instant.parse("2026-07-14T12:00:00Z");
        Clock clock = Clock.fixed(now, ZoneOffset.UTC);
        DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(
            repository, publisher, properties, clock
        );

        EventEnvelope<ChefAcceptedOrderData> event = event(now.plusSeconds(30 * 60));
        when(repository.createOrFind(any())).thenAnswer(invocation -> {
            DeliveryCommandMessage message = invocation.getArgument(0);
            return commandRecord(message, null);
        });
        when(publisher.schedule(any())).thenReturn(
            new DeliveryServiceBusPublisher.ScheduledMessage(7001L, "delivery-command:test")
        );
        when(repository.recordScheduled(any(), anyLong(), any())).thenReturn(true);

        var receipt = scheduler.schedule(event);

        assertThat(receipt.dispatchAt()).isEqualTo(now.plusSeconds(20 * 60));
        assertThat(receipt.scheduledSequenceNumber()).isEqualTo(7001L);
        assertThat(receipt.duplicate()).isFalse();

        ArgumentCaptor<DeliveryCommandMessage> command = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        verify(repository).createOrFind(command.capture());
        assertThat(command.getValue().chefSubOrderId()).isEqualTo(event.data().chefSubOrderId());
        assertThat(command.getValue().idempotencyKey()).isEqualTo(event.data().chefSubOrderId().toString());
        assertThat(command.getValue().area()).isEqualTo("Madhapur");
        assertThat(command.getValue().distanceKm()).isBetween(4.0, 5.0);
        assertThat(command.getValue().orderHour()).isEqualTo(17);
        assertThat(command.getValue().dayOfWeek()).isEqualTo(1);
    }

    @Test
    void readyForPickupAcceleratesUnattemptedScheduledCommandImmediately() {
        DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
        DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        Instant now = Instant.parse("2026-09-09T01:00:00Z");
        Clock clock = Clock.fixed(now, ZoneOffset.UTC);
        DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(
            repository, publisher, properties, clock
        );

        EventEnvelope<ChefAcceptedOrderData> accepted = event(now.plusSeconds(20 * 60));
        DeliveryCommandMessage original = commandMessage(
            accepted,
            now.plusSeconds(10 * 60)
        );
        CommandRecord existing = commandRecord(original, 7001L);
        when(repository.findByChefSubOrderId(original.chefSubOrderId())).thenReturn(java.util.Optional.of(existing));
        when(repository.accelerateScheduled(any(), any(), anyString())).thenReturn(true);

        UUID readyEventId = UUID.randomUUID();
        EventEnvelope<OrderReadyForPickupData> ready = new EventEnvelope<>(
            readyEventId,
            DeliveryCommandModels.ORDER_READY_FOR_PICKUP,
            "1.0",
            now,
            UUID.randomUUID(),
            null,
            "order-service",
            original.chefSubOrderId().toString(),
            new OrderReadyForPickupData(original.orderId(), original.chefSubOrderId(), now)
        );

        var receipt = scheduler.accelerateReadyForPickup(ready);

        assertThat(receipt.accelerated()).isTrue();
        assertThat(receipt.dispatchAt()).isEqualTo(now);
        assertThat(receipt.duplicateOrAlreadyProcessing()).isFalse();

        ArgumentCaptor<DeliveryCommandMessage> accelerated = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        ArgumentCaptor<String> messageId = ArgumentCaptor.forClass(String.class);
        verify(repository).accelerateScheduled(any(), accelerated.capture(), messageId.capture());
        assertThat(accelerated.getValue().dispatchAt()).isEqualTo(now);
        assertThat(accelerated.getValue().readyAt()).isEqualTo(now);
        assertThat(accelerated.getValue().sourceEventId()).isEqualTo(readyEventId);
        assertThat(messageId.getValue()).startsWith("delivery-ready:" + original.chefSubOrderId());
        verify(publisher).publishNow(accelerated.getValue(), messageId.getValue());
        verify(publisher).cancelScheduled(7001L);
    }

    private static EventEnvelope<ChefAcceptedOrderData> event(Instant readyAt) {
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();
        QuoteRequest request = new QuoteRequest(
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
        return new EventEnvelope<>(
            eventId,
            DeliveryCommandModels.CHEF_ACCEPTED_ORDER,
            "1.0",
            Instant.parse("2026-07-14T12:00:00Z"),
            orderId,
            null,
            "order-service",
            "chef-sub-order/" + subOrderId,
            new ChefAcceptedOrderData(orderId, subOrderId, readyAt, null, null, request)
        );
    }

    private static DeliveryCommandMessage commandMessage(
        EventEnvelope<ChefAcceptedOrderData> event,
        Instant dispatchAt
    ) {
        ChefAcceptedOrderData data = event.data();
        return new DeliveryCommandMessage(
            UUID.nameUUIDFromBytes(("delivery-command:" + data.chefSubOrderId()).getBytes()),
            event.eventId(),
            event.correlationId(),
            data.orderId(),
            data.chefSubOrderId(),
            data.readyAt(),
            dispatchAt,
            data.chefSubOrderId().toString(),
            4.5,
            "Madhapur",
            17,
            1,
            data.deliveryRequest()
        );
    }

    private static CommandRecord commandRecord(DeliveryCommandMessage message, Long sequenceNumber) {
        return new CommandRecord(
            message.commandId(), message.chefSubOrderId(), message.orderId(),
            "SCHEDULED", 0, message, sequenceNumber,
            sequenceNumber == null ? null : "delivery-command:test",
            null, null, null, 0,
            0, null, null
        );
    }
}
