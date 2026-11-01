package in.craves.integration.delivery.command;

import in.craves.integration.delivery.command.DeliveryCommandModels.ChefAcceptedOrderData;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandModels.OrderCancelledData;
import in.craves.integration.delivery.command.DeliveryCommandModels.OrderReadyForPickupData;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@ConditionalOnProperty(prefix = "craves.delivery-command", name = "enabled", havingValue = "true")
public class DeliveryCommandScheduler {
    private static final Logger log = LoggerFactory.getLogger(DeliveryCommandScheduler.class);
    private static final ZoneId DELIVERY_CONTEXT_ZONE = ZoneId.of("Asia/Kolkata");
    private static final double EARTH_RADIUS_KM = 6371.0088;

    /** The most a kitchen's habit may move its dispatch later (R16 10). */
    static final Duration MAX_READY_CORRECTION = Duration.ofMinutes(15);

    private final DeliveryCommandRepository repository;
    private final DeliveryServiceBusPublisher publisher;
    private final DeliveryCommandProperties properties;
    private final Clock clock;

    /**
     * Behind craves.delivery-command.ready-correction-enabled (off until 2 to 4 weeks of ready taps exist): a kitchen that
     * usually taps "ready" late gets its riders later by its median lateness, 0 to 15 minutes, so they wait less at the
     * door. Never earlier than the promise; the chef's ready tap still brings dispatch forward. Any failure: no correction.
     */
    private Duration readyCorrection(UUID chefSubOrderId) {
        if (!properties.isReadyCorrectionEnabled()) {
            return Duration.ZERO;
        }
        try {
            Duration late = repository.kitchenReadyLateness(chefSubOrderId).orElse(Duration.ZERO);
            Duration correction = late.isNegative() ? Duration.ZERO : late.compareTo(MAX_READY_CORRECTION) > 0 ? MAX_READY_CORRECTION : late;
            if (!correction.isZero()) {
                log.info("DELIVERY_READY_CORRECTION chefSubOrderId={} seconds={}", chefSubOrderId, correction.toSeconds());
            }
            return correction;
        } catch (RuntimeException exception) {
            log.warn("DELIVERY_READY_CORRECTION chefSubOrderId={} failed: {}", chefSubOrderId, exception.getClass().getSimpleName());
            return Duration.ZERO;
        }
    }

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

    /** Present with CRAVES_FLEET_ENABLED: rain mode starts the search earlier (FleetStage.dispatchEarlier). */
    private FleetStage fleetStage;

    @Autowired(required = false)
    public void setFleetStage(FleetStage fleetStage) {
        this.fleetStage = fleetStage;
    }

    public ScheduleReceipt schedule(EventEnvelope<ChefAcceptedOrderData> event) {
        validate(event);
        ChefAcceptedOrderData data = event.data();
        RoutingContext routingContext = routingContext(event, data);
        Instant dispatchAt = data.readyAt().plus(readyCorrection(data.chefSubOrderId()))
            .minus(properties.getLeadTimeMinutes(), ChronoUnit.MINUTES);
        // Rain mode (R16 19): riders and couriers ride slower, so the search starts 5 minutes earlier.
        dispatchAt = dispatchAt.minus(fleetStage == null ? Duration.ZERO : fleetStage.dispatchEarlier());
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
            routingContext.distanceKm(),
            routingContext.area(),
            routingContext.orderHour(),
            routingContext.dayOfWeek(),
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

    public ReadyAccelerationReceipt accelerateReadyForPickup(
        EventEnvelope<OrderReadyForPickupData> event
    ) {
        validateReadyForPickup(event);
        OrderReadyForPickupData data = event.data();
        CommandRecord command = repository.findByChefSubOrderId(data.chefSubOrderId())
            .orElseThrow(() -> new DeliveryReadyEventNotReadyException(
                "Delivery command has not been created yet for ready-for-pickup event"
            ));

        if (!data.orderId().equals(command.orderId())) {
            throw new DeliveryMessageValidationException(
                "ORDER_READY_FOR_PICKUP orderId does not match the delivery command"
            );
        }

        if (!"SCHEDULED".equals(command.status()) || command.attemptCount() > 0) {
            return new ReadyAccelerationReceipt(
                command.id(), command.message().dispatchAt(), false, true
            );
        }

        Instant dispatchAt = clock.instant();
        DeliveryCommandMessage current = command.message();
        DeliveryCommandMessage accelerated = new DeliveryCommandMessage(
            current.commandId(),
            event.eventId(),
            event.correlationId(),
            current.orderId(),
            current.chefSubOrderId(),
            data.readyAt(),
            dispatchAt,
            current.idempotencyKey(),
            current.distanceKm(),
            current.area(),
            current.orderHour(),
            current.dayOfWeek(),
            current.deliveryRequest()
        );
        String immediateMessageId = "delivery-ready:"
            + data.chefSubOrderId() + ":" + event.eventId();

        boolean acceleratedInDatabase = repository.accelerateScheduled(
            command.id(), accelerated, immediateMessageId
        );
        if (!acceleratedInDatabase) {
            CommandRecord winner = repository.findById(command.id())
                .orElseThrow(() -> new IllegalStateException(
                    "Delivery command disappeared while accelerating ready-for-pickup"
                ));
            if (!"SCHEDULED".equals(winner.status()) || winner.attemptCount() > 0) {
                return new ReadyAccelerationReceipt(
                    winner.id(), winner.message().dispatchAt(), false, true
                );
            }
            throw new IllegalStateException(
                "Delivery command could not be accelerated for ready-for-pickup"
            );
        }

        publisher.publishNow(accelerated, immediateMessageId);

        Long oldSequenceNumber = command.scheduledSequenceNumber();
        if (oldSequenceNumber != null) {
            try {
                publisher.cancelScheduled(oldSequenceNumber);
            } catch (RuntimeException cancellationError) {
                // Safe to continue: the worker claims the command atomically, so the old scheduled
                // copy cannot create a second delivery after the immediate copy is processed.
                log.warn(
                    "Could not cancel superseded delivery schedule commandId={} sequenceNumber={}",
                    command.id(), oldSequenceNumber, cancellationError
                );
            }
        }

        return new ReadyAccelerationReceipt(command.id(), dispatchAt, true, false);
    }

    /**
     * ORDER_CANCELLED (R16 item 11), stored once (delivery_schema.order_cancelled). From then on the order's delivery command
     * books nobody (DeliveryCommandWorker), no rider can accept it, the fleet's dispatch tick ends its trip and tells the
     * rider, and a Borzo or Pidge courier already booked is cancelled (FleetCourierCancel). Only the order is required: an
     * event without one is dead-lettered as invalid.
     */
    public void orderCancelled(EventEnvelope<OrderCancelledData> event) {
        OrderCancelledData data = event == null ? null : event.data();
        if (event == null || event.eventId() == null || !DeliveryCommandModels.ORDER_CANCELLED.equals(event.eventType())
            || data == null || data.chefSubOrderId() == null) {
            throw new DeliveryMessageValidationException("ORDER_CANCELLED needs eventId, eventType and data.chefSubOrderId");
        }
        String reason = StringUtils.hasText(data.reason()) ? data.reason().trim() : "UNSPECIFIED";
        reason = reason.length() <= 200 ? reason : reason.substring(0, 200);
        Instant cancelledAt = data.cancelledAt() != null ? data.cancelledAt()
            : event.occurredAt() != null ? event.occurredAt() : clock.instant();
        boolean first = repository.recordOrderCancelled(data.chefSubOrderId(), reason, cancelledAt);
        log.info("DELIVERY_ORDER_CANCELLED chefSubOrderId={} reason={} repeat={}", data.chefSubOrderId(), reason, !first);
    }

    private static RoutingContext routingContext(EventEnvelope<ChefAcceptedOrderData> event,
                                                 ChefAcceptedOrderData data) {
        QuoteRequest request = data.deliveryRequest();
        double distanceKm = resolveDistanceKm(data.distanceKm(), request);
        String area = resolveArea(data.area(), request.pickup());
        ZonedDateTime localOccurredAt = event.occurredAt().atZone(DELIVERY_CONTEXT_ZONE);
        return new RoutingContext(
            distanceKm,
            area,
            localOccurredAt.getHour(),
            localOccurredAt.getDayOfWeek().getValue() - 1
        );
    }

    private static double resolveDistanceKm(Double suppliedDistanceKm, QuoteRequest request) {
        if (suppliedDistanceKm != null) {
            if (!Double.isFinite(suppliedDistanceKm) || suppliedDistanceKm < 0.0) {
                throw new DeliveryMessageValidationException("distanceKm must be a finite non-negative number");
            }
            return suppliedDistanceKm;
        }

        Stop pickup = request.pickup();
        Stop dropoff = request.dropoff();
        if (hasCoordinates(pickup) && hasCoordinates(dropoff)) {
            return haversineKm(
                pickup.latitude(), pickup.longitude(), dropoff.latitude(), dropoff.longitude()
            );
        }
        throw new DeliveryMessageValidationException(
            "distanceKm or pickup/dropoff coordinates are required for intelligent assignment"
        );
    }

    private static String resolveArea(String suppliedArea, Stop pickup) {
        if (StringUtils.hasText(suppliedArea)) {
            return suppliedArea.trim();
        }
        if (pickup != null && StringUtils.hasText(pickup.address())) {
            String firstAddressPart = pickup.address().split(",", 2)[0].trim();
            if (StringUtils.hasText(firstAddressPart)) {
                return firstAddressPart;
            }
        }
        throw new DeliveryMessageValidationException(
            "area or a pickup address with an area prefix is required for intelligent assignment"
        );
    }

    private static boolean hasCoordinates(Stop stop) {
        return stop != null && stop.latitude() != null && stop.longitude() != null;
    }

    private static double haversineKm(BigDecimal firstLatitude,
                                      BigDecimal firstLongitude,
                                      BigDecimal secondLatitude,
                                      BigDecimal secondLongitude) {
        double latitude1 = Math.toRadians(firstLatitude.doubleValue());
        double latitude2 = Math.toRadians(secondLatitude.doubleValue());
        double latitudeDelta = latitude2 - latitude1;
        double longitudeDelta = Math.toRadians(secondLongitude.doubleValue() - firstLongitude.doubleValue());
        double sinLatitude = Math.sin(latitudeDelta / 2.0);
        double sinLongitude = Math.sin(longitudeDelta / 2.0);
        double a = sinLatitude * sinLatitude
            + Math.cos(latitude1) * Math.cos(latitude2) * sinLongitude * sinLongitude;
        double c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        return EARTH_RADIUS_KM * c;
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
        if (data.deliveryRequest().pickup() == null || data.deliveryRequest().dropoff() == null) {
            throw new DeliveryMessageValidationException("pickup and dropoff are required");
        }
    }

    private static void validateReadyForPickup(EventEnvelope<OrderReadyForPickupData> event) {
        Objects.requireNonNull(event, "event is required");
        if (event.eventId() == null) {
            throw new DeliveryMessageValidationException("eventId is required");
        }
        if (!DeliveryCommandModels.ORDER_READY_FOR_PICKUP.equals(event.eventType())) {
            throw new DeliveryMessageValidationException(
                "eventType must be ORDER_READY_FOR_PICKUP"
            );
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
        OrderReadyForPickupData data = Objects.requireNonNull(event.data(), "event data is required");
        if (data.orderId() == null || data.chefSubOrderId() == null || data.readyAt() == null) {
            throw new DeliveryMessageValidationException(
                "orderId, chefSubOrderId and readyAt are required"
            );
        }
    }

    private record RoutingContext(double distanceKm, String area, int orderHour, int dayOfWeek) {}

    public record ScheduleReceipt(
        UUID commandId,
        Instant dispatchAt,
        Long scheduledSequenceNumber,
        boolean duplicate
    ) {}

    public record ReadyAccelerationReceipt(
        UUID commandId,
        Instant dispatchAt,
        boolean accelerated,
        boolean duplicateOrAlreadyProcessing
    ) {}

    public static class DeliveryMessageValidationException extends RuntimeException {
        public DeliveryMessageValidationException(String message) {
            super(message);
        }
    }

    public static class DeliveryReadyEventNotReadyException extends RuntimeException {
        public DeliveryReadyEventNotReadyException(String message) {
            super(message);
        }
    }
}
