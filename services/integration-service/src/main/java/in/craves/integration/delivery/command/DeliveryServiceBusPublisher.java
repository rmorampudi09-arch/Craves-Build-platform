package in.craves.integration.delivery.command;

import com.azure.messaging.servicebus.ServiceBusMessage;
import com.azure.messaging.servicebus.ServiceBusSenderClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnExpression(
    "${craves.delivery-command.enabled:false} || "
        + "${craves.delivery-command.status-publisher-enabled:false}"
)
public class DeliveryServiceBusPublisher {
    private final ServiceBusSenderClient commandSender;
    private final ServiceBusSenderClient domainEventSender;
    private final ObjectMapper objectMapper;

    public DeliveryServiceBusPublisher(
        @Qualifier("deliveryCommandSender") ServiceBusSenderClient commandSender,
        @Qualifier("deliveryDomainEventSender") ServiceBusSenderClient domainEventSender,
        ObjectMapper objectMapper
    ) {
        this.commandSender = commandSender;
        this.domainEventSender = domainEventSender;
        this.objectMapper = objectMapper;
    }

    public ScheduledMessage schedule(DeliveryCommandMessage command) {
        String messageId = "delivery-command:" + command.chefSubOrderId();
        ServiceBusMessage message = new ServiceBusMessage(writeJson(command))
            .setMessageId(messageId)
            .setCorrelationId(command.correlationId().toString())
            .setSubject(DeliveryCommandModels.DELIVERY_COMMAND)
            .setContentType("application/json");
        message.getApplicationProperties().put("event_type", DeliveryCommandModels.DELIVERY_COMMAND);
        message.getApplicationProperties().put("chef_sub_order_id", command.chefSubOrderId().toString());
        Long sequenceNumber = commandSender.scheduleMessage(
            message,
            command.dispatchAt().atOffset(ZoneOffset.UTC)
        );
        return new ScheduledMessage(sequenceNumber, messageId);
    }

    public void cancelScheduled(long sequenceNumber) {
        commandSender.cancelScheduledMessage(sequenceNumber);
    }

    public void publishDomainEvent(UUID outboxId,
                                   String eventType,
                                   UUID correlationId,
                                   JsonNode payload) {
        ServiceBusMessage message = new ServiceBusMessage(payload.toString())
            .setMessageId(outboxId.toString())
            .setSubject(eventType)
            .setContentType("application/json");
        if (correlationId != null) {
            message.setCorrelationId(correlationId.toString());
        }
        message.getApplicationProperties().put("event_type", eventType);
        message.getApplicationProperties().put("eventType", eventType);
        domainEventSender.sendMessage(message);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Service Bus message could not be serialized", ex);
        }
    }

    public record ScheduledMessage(long sequenceNumber, String messageId) {}
}
