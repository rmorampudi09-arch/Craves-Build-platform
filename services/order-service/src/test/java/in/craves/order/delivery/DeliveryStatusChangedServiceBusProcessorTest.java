package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import org.mockito.ArgumentCaptor;

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

    @Test
    @SuppressWarnings("unchecked")
    void readsIntegrationEventsWithAndWithoutCourierDetails() throws Exception {
        DeliveryStatusUpdateService updates = mock(DeliveryStatusUpdateService.class);
        DeliveryStatusConsumerProperties properties = new DeliveryStatusConsumerProperties();
        properties.setFullyQualifiedNamespace("test.servicebus.windows.net");
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        // What integration-service publishes: null fields are left out, courier details only when the provider sent them.
        String envelope = """
            {"eventId":"6a1f5d2e-0000-4000-8000-000000000001","eventType":"DELIVERY_STATUS_CHANGED","eventVersion":"1.0",
             "occurredAt":"2026-10-20T10:00:00Z","correlationId":"6a1f5d2e-0000-4000-8000-000000000002","causationId":null,
             "source":"integration-service","subject":"delivery-job/6a1f5d2e-0000-4000-8000-000000000003",
             "data":{"deliveryJobId":"6a1f5d2e-0000-4000-8000-000000000003","orderId":"6a1f5d2e-0000-4000-8000-000000000002",
                     "chefSubOrderId":"6a1f5d2e-0000-4000-8000-000000000004","providerId":"pidge",
                     "providerDeliveryId":"pidge-1","status":"COURIER_ASSIGNED","observedAt":"2026-10-20T10:00:00Z"%s}}
            """;
        String withoutCourier = envelope.formatted("");
        String withCourier = envelope.formatted(",\"courierName\":\"Ravi\",\"courierPhone\":\"9000000001\"");
        when(updates.accept(any(), any())).thenReturn(
            new DeliveryStatusUpdateService.ProcessingResult(true, false, "APPLIED"));
        DeliveryStatusChangedServiceBusProcessor processor =
            new DeliveryStatusChangedServiceBusProcessor(updates, properties, mapper);
        try {
            for (String payload : java.util.List.of(withoutCourier, withCourier)) {
                ServiceBusReceivedMessage message = mock(ServiceBusReceivedMessage.class);
                when(message.getBody()).thenReturn(BinaryData.fromString(payload));
                ServiceBusReceivedMessageContext context = mock(ServiceBusReceivedMessageContext.class);
                when(context.getMessage()).thenReturn(message);
                processor.processMessage(context);
                verify(context).complete();
            }
        } finally {
            processor.close();
        }

        ArgumentCaptor<EventEnvelope<DeliveryStatusChangedData>> events = ArgumentCaptor.forClass(EventEnvelope.class);
        verify(updates, times(2)).accept(events.capture(), any());
        DeliveryStatusChangedData plain = events.getAllValues().get(0).data();
        assertThat(plain.status()).isEqualTo("COURIER_ASSIGNED");
        assertThat(plain.courierName()).isNull();
        assertThat(plain.courierPhone()).isNull();
        assertThat(plain.courierPhotoUrl()).isNull();
        assertThat(plain.pickupEtaAt()).isNull();
        DeliveryStatusChangedData courier = events.getAllValues().get(1).data();
        assertThat(courier.courierName()).isEqualTo("Ravi");
        assertThat(courier.courierPhone()).isEqualTo("9000000001");
    }
}
