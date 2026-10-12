package in.craves.order.delivery;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.azure.core.util.BinaryData;
import com.azure.messaging.servicebus.ServiceBusReceivedMessage;
import com.azure.messaging.servicebus.ServiceBusReceivedMessageContext;
import com.azure.messaging.servicebus.models.DeadLetterOptions;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.config.DeliveryStatusConsumerProperties;
import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryStatusChangedServiceBusProcessorTest {
    @Test
    void completesDurablyBufferedPidgeContinuationInsteadOfDeadLettering() throws Exception {
        DeliveryStatusUpdateService updates = mock(DeliveryStatusUpdateService.class);
        DeliveryStatusConsumerProperties properties = new DeliveryStatusConsumerProperties();
        properties.setFullyQualifiedNamespace("test.servicebus.windows.net");
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        UUID checkoutId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(
            jobId, checkoutId, UUID.randomUUID(), "pidge", "pidge-order-2",
            "COURIER_ASSIGNED", null, Instant.parse("2026-10-02T10:02:05Z"),
            "borzo", "borzo-order-1", true);
        EventEnvelope<DeliveryStatusChangedData> event = new EventEnvelope<>(
            UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0",
            data.observedAt(), checkoutId, null, "integration-service",
            "delivery-job/" + jobId, data);
        String payload = mapper.writeValueAsString(event);
        ServiceBusReceivedMessage message = mock(ServiceBusReceivedMessage.class);
        when(message.getBody()).thenReturn(BinaryData.fromString(payload));
        ServiceBusReceivedMessageContext context = mock(ServiceBusReceivedMessageContext.class);
        when(context.getMessage()).thenReturn(message);
        when(updates.accept(any(), eq(payload))).thenReturn(
            new DeliveryStatusUpdateService.ProcessingResult(
                false, false, "WAITING_FOR_HANDOFF"));

        DeliveryStatusChangedServiceBusProcessor processor =
            new DeliveryStatusChangedServiceBusProcessor(updates, properties, mapper);
        try {
            processor.processMessage(context);
        } finally {
            processor.close();
        }

        verify(context).complete();
        verify(context, never()).abandon();
        verify(context, never()).deadLetter(any(DeadLetterOptions.class));
    }

    @Test
    void completesDurablyBufferedHandoffInsteadOfExhaustingServiceBusRetries() throws Exception {
        DeliveryStatusUpdateService updates = mock(DeliveryStatusUpdateService.class);
        DeliveryStatusConsumerProperties properties = new DeliveryStatusConsumerProperties();
        properties.setFullyQualifiedNamespace("test.servicebus.windows.net");
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        UUID checkoutId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(
            jobId, checkoutId, UUID.randomUUID(), "pidge", "pidge-order-2",
            "SEARCHING", null, Instant.parse("2026-10-02T10:02:00Z"),
            "borzo", "borzo-order-1");
        EventEnvelope<DeliveryStatusChangedData> event = new EventEnvelope<>(
            UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0",
            data.observedAt(), checkoutId, null, "integration-service",
            "delivery-job/" + jobId, data);
        String payload = mapper.writeValueAsString(event);
        ServiceBusReceivedMessage message = mock(ServiceBusReceivedMessage.class);
        when(message.getBody()).thenReturn(BinaryData.fromString(payload));
        ServiceBusReceivedMessageContext context = mock(ServiceBusReceivedMessageContext.class);
        when(context.getMessage()).thenReturn(message);
        when(updates.accept(any(), eq(payload))).thenReturn(
            new DeliveryStatusUpdateService.ProcessingResult(
                false, false, "WAITING_FOR_PRIOR_PROVIDER"));

        DeliveryStatusChangedServiceBusProcessor processor =
            new DeliveryStatusChangedServiceBusProcessor(updates, properties, mapper);
        try {
            processor.processMessage(context);
        } finally {
            processor.close();
        }

        verify(context).complete();
        verify(context, never()).abandon();
        verify(context, never()).deadLetter(any(DeadLetterOptions.class));
    }

    @Test
    void completesOlderSupersededBorzoStatusWithoutDeadLettering() throws Exception {
        DeliveryStatusUpdateService updates = mock(DeliveryStatusUpdateService.class);
        DeliveryStatusConsumerProperties properties = new DeliveryStatusConsumerProperties();
        properties.setFullyQualifiedNamespace("test.servicebus.windows.net");
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        UUID checkoutId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(
            jobId, checkoutId, UUID.randomUUID(), "borzo", "borzo-order-1",
            "SEARCHING", null, Instant.parse("2026-10-02T10:00:00Z"));
        EventEnvelope<DeliveryStatusChangedData> event = new EventEnvelope<>(
            UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0",
            data.observedAt(), checkoutId, null, "integration-service",
            "delivery-job/" + jobId, data);
        String payload = mapper.writeValueAsString(event);
        ServiceBusReceivedMessage message = mock(ServiceBusReceivedMessage.class);
        when(message.getBody()).thenReturn(BinaryData.fromString(payload));
        ServiceBusReceivedMessageContext context = mock(ServiceBusReceivedMessageContext.class);
        when(context.getMessage()).thenReturn(message);
        when(updates.accept(any(), eq(payload))).thenReturn(
            new DeliveryStatusUpdateService.ProcessingResult(false, false, "STALE"));

        DeliveryStatusChangedServiceBusProcessor processor =
            new DeliveryStatusChangedServiceBusProcessor(updates, properties, mapper);
        try {
            processor.processMessage(context);
        } finally {
            processor.close();
        }

        verify(context).complete();
        verify(context, never()).abandon();
        verify(context, never()).deadLetter(any(DeadLetterOptions.class));
    }
}
