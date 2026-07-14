package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryStatusChangedData;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryCommandCompletionService {
    private final DeliveryJobRepository deliveryJobs;
    private final DeliveryOutboxRepository outbox;
    private final DeliveryCommandRepository commands;
    private final ObjectMapper objectMapper;

    public DeliveryCommandCompletionService(DeliveryJobRepository deliveryJobs,
                                            DeliveryOutboxRepository outbox,
                                            DeliveryCommandRepository commands,
                                            ObjectMapper objectMapper) {
        this.deliveryJobs = deliveryJobs;
        this.outbox = outbox;
        this.commands = commands;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CompletionReceipt complete(DeliveryCommandMessage command, RoutingResult routingResult) {
        UUID existing = deliveryJobs.findIdByChefSubOrderId(command.chefSubOrderId()).orElse(null);
        if (existing != null) {
            commands.markCompleted(command.commandId());
            return new CompletionReceipt(existing, true);
        }

        UUID deliveryJobId = deliveryJobs.insert(
            command.orderId(), command.chefSubOrderId(), routingResult
        );
        Instant observedAt = routingResult.delivery().observedAt() == null
            ? Instant.now()
            : routingResult.delivery().observedAt();
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(
            deliveryJobId,
            command.orderId(),
            command.chefSubOrderId(),
            routingResult.providerId(),
            routingResult.delivery().providerDeliveryId(),
            routingResult.delivery().status().name(),
            routingResult.delivery().trackingUrl(),
            observedAt
        );
        EventEnvelope<DeliveryStatusChangedData> event = new EventEnvelope<>(
            UUID.randomUUID(),
            DeliveryCommandModels.DELIVERY_STATUS_CHANGED,
            "1.0",
            Instant.now(),
            command.correlationId(),
            command.sourceEventId(),
            "integration-service",
            "delivery-job/" + deliveryJobId,
            data
        );
        JsonNode payload = objectMapper.valueToTree(event);
        outbox.enqueue(
            DeliveryCommandModels.DELIVERY_STATUS_CHANGED,
            deliveryJobId,
            command.correlationId(),
            payload
        );
        commands.markCompleted(command.commandId());
        return new CompletionReceipt(deliveryJobId, false);
    }

    public record CompletionReceipt(UUID deliveryJobId, boolean duplicate) {}
}
