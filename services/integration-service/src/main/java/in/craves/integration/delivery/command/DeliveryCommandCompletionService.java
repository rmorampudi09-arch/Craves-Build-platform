package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryStatusChangedData;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryCommandCompletionService {
    private final DeliveryAssignmentRepository assignments;
    private final DeliveryJobRepository deliveryJobs;
    private final DeliveryOutboxRepository outbox;
    private final DeliveryCommandRepository commands;
    private final ObjectMapper objectMapper;
    private final BorzoPidgeHandoffRepository handoffs;
    private final DeliveryCommandProperties properties;

    @Autowired
    public DeliveryCommandCompletionService(DeliveryAssignmentRepository assignments,
                                             DeliveryJobRepository deliveryJobs,
                                             DeliveryOutboxRepository outbox,
                                             DeliveryCommandRepository commands,
                                             ObjectMapper objectMapper,
                                             BorzoPidgeHandoffRepository handoffs,
                                             DeliveryCommandProperties properties) {
        this.assignments = assignments;
        this.deliveryJobs = deliveryJobs;
        this.outbox = outbox;
        this.commands = commands;
        this.objectMapper = objectMapper;
        this.handoffs = handoffs;
        this.properties = properties;
    }

    DeliveryCommandCompletionService(DeliveryAssignmentRepository assignments,
                                     DeliveryJobRepository deliveryJobs,
                                     DeliveryOutboxRepository outbox,
                                     DeliveryCommandRepository commands,
                                     ObjectMapper objectMapper) {
        this(assignments, deliveryJobs, outbox, commands, objectMapper,
            null, new DeliveryCommandProperties());
    }

    @Transactional
    public CompletionReceipt complete(DeliveryCommandMessage command, RoutingResult routingResult) {
        UUID existing = deliveryJobs.findIdByChefSubOrderId(command.chefSubOrderId()).orElse(null);
        if (existing != null) {
            commands.markCompleted(command.commandId());
            return new CompletionReceipt(existing, true);
        }

        List<String> failedProviders = routingResult.createAudit().stream()
            .filter(audit -> !audit.successful())
            .map(DeliveryCommandModels.CreateAudit::providerId)
            .distinct()
            .toList();
        assignments.markAssigned(
            routingResult.intelligenceAssignment().assignmentId(),
            routingResult.executedCandidateId(),
            failedProviders
        );

        UUID deliveryJobId = deliveryJobs.insert(
            command.orderId(), command.chefSubOrderId(), routingResult
        );
        Instant borzoWindowStartedAt = "borzo".equals(routingResult.providerId())
            ? commands.borzoWindowStartedAt(command.commandId()).orElse(null) : null;
        if (borzoWindowStartedAt != null
            && (routingResult.delivery().status()
                    == in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.PENDING
                || routingResult.delivery().status()
                    == in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.SEARCHING
                || routingResult.delivery().status()
                    == in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.DELAYED)) {
            handoffs.enroll(deliveryJobId, routingResult.delivery().providerDeliveryId(),
                borzoWindowStartedAt);
        }
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
            command.orderId(),
            command.sourceEventId(),
            "integration-service",
            "delivery-job/" + deliveryJobId,
            data
        );
        JsonNode payload = objectMapper.valueToTree(event);
        outbox.enqueue(
            DeliveryCommandModels.DELIVERY_STATUS_CHANGED,
            deliveryJobId,
            command.orderId(),
            payload
        );
        commands.markCompleted(command.commandId());
        return new CompletionReceipt(deliveryJobId, false);
    }

    public record CompletionReceipt(UUID deliveryJobId, boolean duplicate) {}
}
