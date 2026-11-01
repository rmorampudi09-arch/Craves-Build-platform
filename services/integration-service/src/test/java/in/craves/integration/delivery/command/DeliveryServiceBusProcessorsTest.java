package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.azure.core.util.BinaryData;
import com.azure.messaging.servicebus.ServiceBusReceivedMessage;
import com.azure.messaging.servicebus.ServiceBusReceivedMessageContext;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import com.azure.messaging.servicebus.models.DeadLetterOptions;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryServiceBusConfiguration.DeliveryServiceBusClientFactory;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * R16 item 11: ORDER_CANCELLED on the domain-event subscription is recorded and completed, not read as a chef acceptance and
 * dead-lettered as the release before this one did.
 */
class DeliveryServiceBusProcessorsTest {
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
    final UUID chefSubOrderId = UUID.randomUUID();

    @Test
    void anOrderCancelledEventIsRecordedAndCompleted() {
        Instant cancelledAt = Instant.parse("2026-11-01T09:30:00Z");
        when(repository.recordOrderCancelled(chefSubOrderId, "CUSTOMER_CANCELLED", cancelledAt)).thenReturn(true);
        ServiceBusReceivedMessageContext context = message(event("{\"checkoutId\":\"" + UUID.randomUUID() + "\",\"chefSubOrderId\":\""
            + chefSubOrderId + "\",\"reason\":\"CUSTOMER_CANCELLED\",\"cancelledAt\":\"2026-11-01T09:30:00Z\"}"));

        process(context);

        verify(repository).recordOrderCancelled(chefSubOrderId, "CUSTOMER_CANCELLED", cancelledAt);
        verify(context).complete();
        verify(context, never()).abandon();
        verify(context, never()).deadLetter(any(DeadLetterOptions.class));
    }

    @Test
    void anOrderCancelledEventWithoutItsOrderIsDeadLetteredAsInvalid() {
        ServiceBusReceivedMessageContext context = message(event("{\"reason\":\"CUSTOMER_CANCELLED\"}"));

        process(context);

        ArgumentCaptor<DeadLetterOptions> options = ArgumentCaptor.forClass(DeadLetterOptions.class);
        verify(context).deadLetter(options.capture());
        assertThat(options.getValue().getDeadLetterReason()).isEqualTo("INVALID_DELIVERY_DOMAIN_EVENT");
        verify(context, never()).complete();
        verifyNoInteractions(repository);
    }

    /** The envelope order-service's OrderCancelledEventFactory writes (contracts/events/order-cancelled-v1.schema.json). */
    private String event(String data) {
        return "{\"eventId\":\"" + UUID.randomUUID() + "\",\"eventType\":\"ORDER_CANCELLED\",\"eventVersion\":\"1.0\","
            + "\"occurredAt\":\"2026-11-01T09:30:00Z\",\"correlationId\":\"" + UUID.randomUUID() + "\",\"causationId\":null,"
            + "\"source\":\"order-service\",\"subject\":\"" + chefSubOrderId + "\",\"data\":" + data + "}";
    }

    /** As order-service's transport sends it: the type in the event_type property the subscription rule filters on. */
    private static ServiceBusReceivedMessageContext message(String body) {
        ServiceBusReceivedMessage message = mock(ServiceBusReceivedMessage.class);
        when(message.getBody()).thenReturn(BinaryData.fromString(body));
        when(message.getApplicationProperties()).thenReturn(Map.<String, Object>of("event_type", "ORDER_CANCELLED"));
        when(message.getSubject()).thenReturn("ORDER_CANCELLED");
        when(message.getMessageId()).thenReturn("order-cancelled-1");
        ServiceBusReceivedMessageContext context = mock(ServiceBusReceivedMessageContext.class);
        when(context.getMessage()).thenReturn(message);
        return context;
    }

    private void process(ServiceBusReceivedMessageContext context) {
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setFullyQualifiedNamespace("test.servicebus.windows.net");
        DeliveryServiceBusProcessors processors = new DeliveryServiceBusProcessors(new DeliveryServiceBusClientFactory(properties),
            new DeliveryCommandScheduler(repository, mock(DeliveryServiceBusPublisher.class), properties), mock(DeliveryCommandWorker.class),
            properties, json, mock(ServiceBusSenderClient.class), Optional.empty());
        try {
            processors.processDeliveryDomainEvent(context);
        } finally {
            processors.close();
        }
    }
}
