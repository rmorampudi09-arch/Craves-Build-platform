package in.craves.order.delivery;

import com.azure.core.util.BinaryData;
import com.azure.messaging.servicebus.*;
import com.azure.messaging.servicebus.models.DeadLetterOptions;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.config.DeliveryStatusConsumerProperties;
import in.craves.order.delivery.DeliveryStatusModels.*;
import in.craves.order.delivery.DeliveryStatusUpdateService.*;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DeliveryHandoffServiceBusSettlementTest {
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    @Test void unavailableProofIsRetriedWithoutAcknowledgingOrDropping() throws Exception {
        settle(new DeliveryStatusRetryableException("Delivery handoff proof is temporarily unavailable"), 1, null);
    }
    @Test void exhaustedProofRetriesRemainInDurableDeadLetterQueue() throws Exception {
        settle(new DeliveryStatusRetryableException("Delivery handoff proof is temporarily unavailable"), 5, "DELIVERY_STATUS_NOT_READY");
    }
    @Test void forgedProofIsDeadLetteredAsInvalid() throws Exception {
        settle(new DeliveryStatusNonRetryableException("Delivery handoff does not match committed evidence"), 1, "INVALID_DELIVERY_STATUS");
    }
    void settle(RuntimeException error, long attempts, String reason) throws Exception {
        var update = mock(DeliveryStatusUpdateService.class);
        when(update.accept(any(), anyString())).thenThrow(error);
        var properties = new DeliveryStatusConsumerProperties();
        properties.setConnectionString("Endpoint=sb://offline.invalid/;SharedAccessKeyName=offline;SharedAccessKey=dGVzdA==");
        UUID job = UUID.randomUUID(), checkout = UUID.randomUUID();
        var event = new EventEnvelope<>(UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0", Instant.now(),
            checkout, null, "integration-service", "delivery-job/" + job,
            new DeliveryStatusChangedData(job, checkout, UUID.randomUUID(), "pidge", "pidge-test", "SEARCHING",
                null, Instant.now(), "borzo", "borzo-test", null));
        var message = mock(ServiceBusReceivedMessage.class);
        when(message.getBody()).thenReturn(BinaryData.fromString(json.writeValueAsString(event)));
        when(message.getDeliveryCount()).thenReturn(attempts);
        var context = mock(ServiceBusReceivedMessageContext.class);
        when(context.getMessage()).thenReturn(message);
        // Processor construction does not connect; no start() is called in this offline test.
        var processor = new DeliveryStatusChangedServiceBusProcessor(update, properties, json);
        try {
            var process = DeliveryStatusChangedServiceBusProcessor.class.getDeclaredMethod("processMessage", ServiceBusReceivedMessageContext.class);
            process.setAccessible(true); process.invoke(processor, context);
            verify(context, never()).complete();
            if (reason == null) { verify(context).abandon(); verify(context, never()).deadLetter(any()); }
            else {
                var options = org.mockito.ArgumentCaptor.forClass(DeadLetterOptions.class);
                verify(context).deadLetter(options.capture());
                assertEquals(reason, options.getValue().getDeadLetterReason());
                assertEquals(error.getMessage(), options.getValue().getDeadLetterErrorDescription());
                verify(context, never()).abandon();
            }
        } finally { processor.close(); }
    }
}
