package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryStatusChangedData;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BorzoPidgeHandoffCompletionService {
    private final DeliveryJobRepository jobs;
    private final DeliveryAssignmentRepository assignments;
    private final BorzoPidgeHandoffRepository handoffs;
    private final DeliveryOutboxRepository outbox;
    private final ObjectMapper objectMapper;

    public BorzoPidgeHandoffCompletionService(DeliveryJobRepository jobs,
                                             DeliveryAssignmentRepository assignments,
                                             BorzoPidgeHandoffRepository handoffs,
                                             DeliveryOutboxRepository outbox,
                                             ObjectMapper objectMapper) {
        this.jobs = jobs;
        this.assignments = assignments;
        this.handoffs = handoffs;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void complete(BorzoPidgeHandoffRepository.Handoff handoff,
                         ProviderDelivery pidgeDelivery) {
        if (!"pidge".equals(pidgeDelivery.providerId())
            || pidgeDelivery.providerDeliveryId() == null
            || pidgeDelivery.providerDeliveryId().isBlank()) {
            throw new IllegalArgumentException("Confirmed Pidge delivery is required for handoff");
        }
        DeliveryJobRepository.HandoffJob job = jobs.findHandoffJob(handoff.deliveryJobId())
            .orElseThrow(() -> new IllegalStateException("Delivery job is missing during handoff"));
        if (!"borzo".equals(job.providerId())
            || !handoff.borzoProviderDeliveryId().equals(job.providerDeliveryId())) {
            throw new IllegalStateException("Original Borzo delivery changed during handoff");
        }
        Instant observedAt = Instant.now();
        if (job.lastStatusObservedAt() != null
            && !observedAt.isAfter(job.lastStatusObservedAt())) {
            observedAt = job.lastStatusObservedAt().plusMillis(1);
        }
        if (!jobs.switchToPidge(job.id(), handoff.borzoProviderDeliveryId(),
            pidgeDelivery, observedAt)) {
            throw new IllegalStateException("Borzo delivery is no longer eligible for handoff");
        }
        assignments.markBorzoPidgeHandoff(job.assignmentId());
        if (!handoffs.complete(job.id(), pidgeDelivery.providerDeliveryId())) {
            throw new IllegalStateException("Handoff journal could not be completed");
        }

        DeliveryStatusChangedData data = new DeliveryStatusChangedData(
            job.id(), job.orderId(), job.chefSubOrderId(), "pidge",
            pidgeDelivery.providerDeliveryId(), pidgeDelivery.status().name(),
            pidgeDelivery.trackingUrl(), observedAt,
            "borzo", handoff.borzoProviderDeliveryId()
        );
        EventEnvelope<DeliveryStatusChangedData> event = new EventEnvelope<>(
            UUID.randomUUID(), DeliveryCommandModels.DELIVERY_STATUS_CHANGED, "1.0",
            Instant.now(), job.orderId(), null, "integration-service",
            "delivery-job/" + job.id(), data
        );
        outbox.enqueue(DeliveryCommandModels.DELIVERY_STATUS_CHANGED,
            job.id(), job.orderId(), objectMapper.valueToTree(event));
    }
}
