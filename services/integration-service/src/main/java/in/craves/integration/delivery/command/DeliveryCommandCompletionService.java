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
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryCommandCompletionService {
    private static final Logger log = LoggerFactory.getLogger(DeliveryCommandCompletionService.class);
    private final DeliveryAssignmentRepository assignments;
    private final DeliveryJobRepository deliveryJobs;
    private final DeliveryOutboxRepository outbox;
    private final DeliveryCommandRepository commands;
    private final ObjectMapper objectMapper;
    private final BorzoPidgeHandoffRepository handoffs;
    private final DeliveryCommandProperties properties;
    private ProviderCreateAttemptRepository journal;
    private in.craves.integration.delivery.billing.CourierCharges charges;

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

    /** The booking journal (V191); used only while CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED is on. */
    @Autowired(required = false)
    public void setJournal(ProviderCreateAttemptRepository journal) {
        this.journal = journal;
    }

    /** Courier charge records (V199); written only while CRAVES_DELIVERY_COURIER_CHARGE_ENABLED is on. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setCharges(in.craves.integration.delivery.billing.CourierCharges charges) {
        this.charges = charges;
    }

    @Transactional
    public CompletionReceipt complete(DeliveryCommandMessage command, RoutingResult routingResult) {
        return complete(command, routingResult, null);
    }

    /**
     * leaseToken: the claim's CommandRecord.processingStartedAt, from a pass of the command worker with the journal on.
     * Another pass that has taken the command over since makes this throw before anything is written.
     */
    @Transactional
    public CompletionReceipt complete(DeliveryCommandMessage command, RoutingResult routingResult, Instant leaseToken) {
        if (leaseToken != null && !commands.lockLease(command.commandId(), leaseToken)) {
            throw new StaleCommandLeaseException();
        }
        boolean journalled = journal != null && journal.enabled() && routingResult.delivery() != null;
        UUID existing = deliveryJobs.findIdByChefSubOrderId(command.chefSubOrderId()).orElse(null);
        if (existing != null) {
            if (journalled) {
                String booking = routingResult.delivery().providerDeliveryId();
                boolean strayRow = journal.stray(command.chefSubOrderId(), routingResult.providerId(), routingResult.clientReference(), booking);
                // Another job got there first (a rider, or ops): this booking is real and nobody's. Kept, and a person is told.
                // Not when the journal already has it as the order's job: then this is the same booking, delivered twice.
                if (strayRow || journal.forOrder(command.chefSubOrderId()).stream().noneMatch(row -> booking.equals(row.providerRef())
                    && ("CONFIRMED".equals(row.state()) || "ADOPTED".equals(row.state())))) {
                    log.error("CRAVES_ALERT alert=COURIER_ORPHAN_BOOKING_FOUND provider={} chefSubOrderId={} providerRef={} orderHasJob=true "
                        + "commandStatus=COMPLETED", routingResult.providerId(), command.chefSubOrderId(), booking);
                }
            }
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
        if (charges != null) {
            // A record only, in a savepoint: it never stops the booking.
            charges.booked(command.orderId(), command.chefSubOrderId(), deliveryJobId, routingResult.delivery());
        }
        if (journalled) {
            // In the job's transaction, so the journal never says "booked" without a job. No row: a command from before the flag.
            if (!journal.confirm(command.chefSubOrderId(), routingResult.providerId(), routingResult.clientReference(),
                    routingResult.delivery().providerDeliveryId())
                && journal.find(routingResult.providerId(), routingResult.clientReference()).isPresent()) {
                log.warn("Courier booking journal disagrees with the delivery job chefSubOrderId={} provider={} providerRef={}: the booking "
                    + "is the job, but its attempt was already resolved otherwise", command.chefSubOrderId(), routingResult.providerId(),
                    routingResult.delivery().providerDeliveryId());
            }
        }
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

    /**
     * A booking the journal had given up becomes the order's job (CourierStrayBookings). Empty, with nothing written,
     * when a pass or a lookup holds the command, the order has a job by now, or order-service has cancelled it (a cancel
     * is a row of its own and leaves the command's status alone until a pass claims it).
     */
    @Transactional
    public Optional<CompletionReceipt> adoptStray(DeliveryCommandMessage command, RoutingResult found) {
        if (!commands.lockIdle(command.commandId()) || deliveryJobs.findIdByChefSubOrderId(command.chefSubOrderId()).isPresent()
            || commands.orderCancelled(command.chefSubOrderId())) {
            return Optional.empty();
        }
        return Optional.of(complete(command, found, null));
    }

    public record CompletionReceipt(UUID deliveryJobId, boolean duplicate) {}

    /** The pass no longer holds the command (its lease lapsed and another pass claimed it): it may not record its booking. */
    public static class StaleCommandLeaseException extends RuntimeException {
        StaleCommandLeaseException() {
            super("Another pass has taken over this delivery command");
        }
    }
}
