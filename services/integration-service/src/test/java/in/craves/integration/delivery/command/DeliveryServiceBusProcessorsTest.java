package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.azure.core.util.BinaryData;
import com.azure.messaging.servicebus.ServiceBusReceivedMessage;
import com.azure.messaging.servicebus.ServiceBusReceivedMessageContext;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import com.azure.messaging.servicebus.models.DeadLetterOptions;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryServiceBusConfiguration.DeliveryServiceBusClientFactory;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
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
    final DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
    final UUID chefSubOrderId = UUID.randomUUID();

    /**
     * The contract with order-service: the exact JSON its OrderCancelledEventFactory writes is recorded as a cancel.
     * order-service keeps the same file and checks its output against it (DeliveryEventContractTest), so change both copies
     * together.
     */
    @Test
    void theOrderCancelledEventOrderServiceWritesIsRecorded() throws Exception {
        String body = fixture("order-cancelled-v1.json");
        JsonNode data = json.readTree(body).path("data");
        UUID order = UUID.fromString(data.path("chefSubOrderId").asText());
        when(repository.recordOrderCancelled(any(), any(), any())).thenReturn(true);
        ServiceBusReceivedMessageContext context = message(body, "ORDER_CANCELLED", order.toString());

        process(context);

        verify(repository).recordOrderCancelled(order, data.path("reason").asText(), Instant.parse(data.path("cancelledAt").asText()));
        verify(context).complete();
        verify(context, never()).deadLetter(any(DeadLetterOptions.class));
    }

    /**
     * R22 finding 1a, the same contract for the chef's ready tap: order-service's ORDER_READY_FOR_PICKUP moves the order's
     * waiting delivery command to now and sends it at once, instead of at promised ready minus the lead time.
     */
    @Test
    void theReadyEventOrderServiceWritesStartsTheSearchNow() throws Exception {
        String body = fixture("order-ready-for-pickup-v1.json");
        JsonNode event = json.readTree(body);
        UUID order = UUID.fromString(event.path("data").path("chefSubOrderId").asText());
        UUID checkout = UUID.fromString(event.path("data").path("orderId").asText());
        Instant plannedDispatch = Instant.now().plusSeconds(600);
        DeliveryCommandMessage waiting = new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), checkout,
            order, plannedDispatch.plusSeconds(600), plannedDispatch, order.toString(), 4.5, "Madhapur", 17, 1, null);
        when(repository.findByChefSubOrderId(order)).thenReturn(Optional.of(new CommandRecord(waiting.commandId(), order, checkout,
            "SCHEDULED", 0, waiting, 7001L, "delivery-command:test", null, null, null, 0, 0, null, null)));
        when(repository.accelerateScheduled(any(), any(), anyString())).thenReturn(true);
        ServiceBusReceivedMessageContext context = message(body, "ORDER_READY_FOR_PICKUP", order.toString());

        process(context);

        ArgumentCaptor<DeliveryCommandMessage> moved = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        ArgumentCaptor<String> messageId = ArgumentCaptor.forClass(String.class);
        verify(repository).accelerateScheduled(eq(waiting.commandId()), moved.capture(), messageId.capture());
        assertThat(moved.getValue().dispatchAt()).isBefore(plannedDispatch).isBeforeOrEqualTo(Instant.now());
        assertThat(moved.getValue().readyAt()).isEqualTo(Instant.parse(event.path("data").path("readyAt").asText()));
        assertThat(moved.getValue().sourceEventId()).isEqualTo(UUID.fromString(event.path("eventId").asText()));
        verify(publisher).publishNow(moved.getValue(), messageId.getValue());
        verify(publisher).cancelScheduled(7001L);
        verify(context).complete();
        verify(context, never()).deadLetter(any(DeadLetterOptions.class));
    }

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

    /** The reason is stored and logged, so only a code is kept: free text, which could carry a CR or LF, is stored as OTHER. */
    @Test
    void aReasonThatIsNotACodeIsStoredAsOther() {
        when(repository.recordOrderCancelled(any(), any(), any())).thenReturn(true);
        for (String reason : List.of("CUSTOMER_CANCELLED\\r\\nDELIVERY_ORDER_CANCELLED chefSubOrderId=forged", "Customer changed mind")) {
            ServiceBusReceivedMessageContext context = message(event(data(reason)));
            process(context);
            verify(context).complete();
        }
        verify(repository, times(2)).recordOrderCancelled(eq(chefSubOrderId), eq("OTHER"), any());
    }

    /** An event whose subject or aggregateId names another order than its data is dead-lettered as invalid, recording nothing. */
    @Test
    void anOrderCancelledEventForAnotherOrderIsDeadLetteredAsInvalid() {
        String other = UUID.randomUUID().toString();
        for (ServiceBusReceivedMessageContext context : List.of(message(event(other, data("CUSTOMER_CANCELLED"))),
            message(event(data("CUSTOMER_CANCELLED")), other))) {
            process(context);
            ArgumentCaptor<DeadLetterOptions> options = ArgumentCaptor.forClass(DeadLetterOptions.class);
            verify(context).deadLetter(options.capture());
            assertThat(options.getValue().getDeadLetterReason()).isEqualTo("INVALID_DELIVERY_DOMAIN_EVENT");
            verify(context, never()).complete();
        }
        verifyNoInteractions(repository);
    }

    private String data(String reason) {
        return "{\"checkoutId\":\"" + UUID.randomUUID() + "\",\"chefSubOrderId\":\"" + chefSubOrderId + "\",\"reason\":\"" + reason
            + "\",\"cancelledAt\":\"2026-11-01T09:30:00Z\"}";
    }

    private String event(String data) {
        return event(chefSubOrderId.toString(), data);
    }

    /** The envelope order-service's OrderCancelledEventFactory writes (contracts/events/order-cancelled-v1.schema.json). */
    private static String event(String subject, String data) {
        return "{\"eventId\":\"" + UUID.randomUUID() + "\",\"eventType\":\"ORDER_CANCELLED\",\"eventVersion\":\"1.0\","
            + "\"occurredAt\":\"2026-11-01T09:30:00Z\",\"correlationId\":\"" + UUID.randomUUID() + "\",\"causationId\":null,"
            + "\"source\":\"order-service\",\"subject\":\"" + subject + "\",\"data\":" + data + "}";
    }

    private ServiceBusReceivedMessageContext message(String body) {
        return message(body, chefSubOrderId.toString());
    }

    /** As order-service's transport sends it: the type in the event_type property the subscription rule filters on, the order as aggregateId. */
    private static ServiceBusReceivedMessageContext message(String body, String aggregateId) {
        return message(body, "ORDER_CANCELLED", aggregateId);
    }

    private static ServiceBusReceivedMessageContext message(String body, String eventType, String aggregateId) {
        ServiceBusReceivedMessage message = mock(ServiceBusReceivedMessage.class);
        when(message.getBody()).thenReturn(BinaryData.fromString(body));
        when(message.getApplicationProperties()).thenReturn(Map.<String, Object>of("event_type", eventType, "aggregateId", aggregateId));
        when(message.getSubject()).thenReturn(eventType);
        when(message.getMessageId()).thenReturn("order-cancelled-1");
        ServiceBusReceivedMessageContext context = mock(ServiceBusReceivedMessageContext.class);
        when(context.getMessage()).thenReturn(message);
        return context;
    }

    private String fixture(String name) throws IOException {
        try (InputStream stream = getClass().getResourceAsStream("/contracts/" + name)) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private void process(ServiceBusReceivedMessageContext context) {
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setFullyQualifiedNamespace("test.servicebus.windows.net");
        DeliveryServiceBusProcessors processors = new DeliveryServiceBusProcessors(new DeliveryServiceBusClientFactory(properties),
            new DeliveryCommandScheduler(repository, publisher, properties), mock(DeliveryCommandWorker.class),
            properties, json, mock(ServiceBusSenderClient.class), Optional.empty());
        try {
            processors.processDeliveryDomainEvent(context);
        } finally {
            processors.close();
        }
    }
}
