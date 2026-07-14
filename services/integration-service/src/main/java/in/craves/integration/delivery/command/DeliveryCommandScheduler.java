package in.craves.integration.delivery.command;

import in.craves.integration.delivery.command.DeliveryCommandModels.ChefAcceptedOrderData;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@ConditionalOnProperty(prefix = "craves.delivery-command", name = "enabled", havingValue = "true")
public class DeliveryCommandScheduler {
    private final DeliveryCommandRepository repository;
    private final DeliveryServiceBusPublisher publisher;
    private final DeliveryCommandProperties properties;
    private final Clock clock;

    @Autowired
    public DeliveryCommandScheduler(DeliveryCommandRepository repository,
                                    DeliveryServiceBusPublisher publisher,
                                    DeliveryCommandProperties properties) {
        this(repository, publisher, properties, Clock.systemUTC());
    }

    DeliveryCommandScheduler(DeliveryCommandRepository repository,
                             DeliveryServiceBusPublisher publisher,
                             DeliveryCommandProperties properties,
                             Clock clock) {
        this.repository = repository;
        this.publisher = publisher;
        this.properties = properties;
        this.clock = clock;
    }

    public ScheduleReceipt schedule(EventEnvelope<ChefAcceptedOrderData> event) {
        validate(event);
        ChefAcceptedOrderData data = event.data();
        Instant dispatchAt = data.readyAt().minus(properties.getLeadTimeMinutes(), ChronoUnit.MINUTES);
        Instant minimumDispatchAt = clock.instant().plusSeconds(5);
        if (dispatchAt.isBefore(minimumDispatchAt)) {
            dispatchAt = minimumDispatchAt;
        }

        UUID commandId = UUID.nameUUIDFromBytes(
            ("delivery-command:" + data.chefSubOrderId()).getBytes(java.nio.charset.StandardCharsets.UTF_8)
        );
        DeliveryCommandMessage candidate = new DeliveryCommandMessage(
            commandId,
            event.eventId(),
            event.correlationId(),
            data.orderId(),
            data.chefSubOrderId(),
            data.readyAt(),
            dispatchAt,
            data.chefSubOrderId().toString(),
            data.deliveryRequest()
        );

        CommandRecord command = repository.createOrFind(candidate);
        if ("COMPLETED".equals(command.status()) || command.scheduledSequenceNumber() != null) {
            return new ScheduleReceipt(
                command.id(),
                command.message().dispatchAt(),
                command.scheduledSequenceNumber(),
                true
            );
        }

        DeliveryServiceBusPublisher.ScheduledMessage scheduled = publisher.schedule(command.message());
        boolean recorded = repository.recordScheduled(
            command.id(), scheduled.sequenceNumber(), scheduled.messageId()
        );
        if (!recorded) {
            publisher.cancelScheduled(scheduled.sequenceNumber());
            CommandRecord winner = repository.findById(command.id()).orElse(command);
            return new ScheduleReceipt(
                winner.id(),
                winner.message().dispatchAt(),
                winner.scheduledSequenceNumber(),
                true
            );
        }

        return new ScheduleReceipt(
            command.id(), command.message().dispatchAt(), scheduled.sequenceNumber(), false
        );
    }

    private static void validate(EventEnvelope<ChefAcceptedOrderData> event) {
        Objects.requireNonNull(event, "event is required");
        if (event.eventId() == null) {
            throw new DeliveryMessageValidationException("eventId is required");
        }
        if (!DeliveryCommandModels.CHEF_ACCEPTED_ORDER.equals(event.eventType())) {
            throw new DeliveryMessageValidationException("eventType must be CHEF_ACCEPTED_ORDER");
        }
        if (!StringUtils.hasText(event.eventVersion())) {
            throw new DeliveryMessageValidationException("eventVersion is required");
        }
        if (event.occurredAt() == null || event.correlationId() == null) {
            throw new DeliveryMessageValidationException("occurredAt and correlationId are required");
        }
        if (!StringUtils.hasText(event.source()) || !StringUtils.hasText(event.subject())) {
            throw new DeliveryMessageValidationException("source and subject are required");
        }
        ChefAcceptedOrderData data = Objects.requireNonNull(event.data(), "event data is required");
        if (data.orderId() == null || data.chefSubOrderId() == null || data.readyAt() == null) {
            throw new DeliveryMessageValidationException(
                "orderId, chefSubOrderId and readyAt are required"
            );
        }
        if (data.deliveryRequest() == null) {
            throw new DeliveryMessageValidationException("deliveryRequest is required");
        }
    }

    public record ScheduleReceipt(
        UUID commandId,
        Instant dispatchAt,
        Long scheduledSequenceNumber,
        boolean duplicate
    ) {}

    public static class DeliveryMessageValidationException extends RuntimeException {
        public DeliveryMessageValidationException(String message) {
            super(message);
        }
    }
}
