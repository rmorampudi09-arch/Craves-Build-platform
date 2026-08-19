package in.craves.order.delivery;

import in.craves.order.delivery.DeliveryTelemetryModels.DeliveryTelemetryUpdatedData;
import in.craves.order.delivery.DeliveryTelemetryModels.EventEnvelope;
import java.math.BigDecimal;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class DeliveryTelemetryEventValidator {
    private static final Set<String> STATUSES = Set.of(
        "PENDING",
        "SEARCHING",
        "COURIER_ASSIGNED",
        "COURIER_TO_PICKUP",
        "AT_PICKUP",
        "PICKED_UP",
        "IN_TRANSIT",
        "AT_DROPOFF",
        "DELIVERED",
        "CANCELLED",
        "DELAYED",
        "RETURNING",
        "RETURNED",
        "FAILED"
    );

    public void validate(EventEnvelope<DeliveryTelemetryUpdatedData> event) {
        if (event == null || event.eventId() == null || event.data() == null) {
            throw new DeliveryTelemetryValidationException("Delivery telemetry event envelope is incomplete");
        }
        if (!"DELIVERY_TELEMETRY_UPDATED".equals(event.eventType())) {
            throw new DeliveryTelemetryValidationException("Unexpected delivery telemetry event type");
        }
        if (!"1.0".equals(event.eventVersion())) {
            throw new DeliveryTelemetryValidationException("Unsupported delivery telemetry event version");
        }
        if (!"integration-service".equals(event.source())) {
            throw new DeliveryTelemetryValidationException("Unexpected delivery telemetry event source");
        }
        if (event.occurredAt() == null || event.correlationId() == null) {
            throw new DeliveryTelemetryValidationException("Delivery telemetry tracing fields are required");
        }

        DeliveryTelemetryUpdatedData data = event.data();
        if (data.deliveryJobId() == null || data.orderId() == null || data.chefSubOrderId() == null) {
            throw new DeliveryTelemetryValidationException("Delivery telemetry business identifiers are required");
        }
        if (!event.correlationId().equals(data.orderId())) {
            throw new DeliveryTelemetryValidationException("Delivery telemetry correlation ID does not match checkout");
        }
        if (!("delivery-job/" + data.deliveryJobId()).equals(event.subject())) {
            throw new DeliveryTelemetryValidationException("Delivery telemetry subject does not match delivery job");
        }
        requireText(data.providerId(), "providerId");
        requireText(data.providerDeliveryId(), "providerDeliveryId");
        if (!STATUSES.contains(data.status())) {
            throw new DeliveryTelemetryValidationException("Unsupported normalized delivery status");
        }
        if (data.observedAt() == null) {
            throw new DeliveryTelemetryValidationException("Delivery telemetry observedAt is required");
        }

        validateCoordinates(data);
        validateWindow(data.estimatedPickupStartAt(), data.estimatedPickupEndAt(), "pickup");
        validateWindow(data.estimatedDropoffStartAt(), data.estimatedDropoffEndAt(), "dropoff");
    }

    private static void validateCoordinates(DeliveryTelemetryUpdatedData data) {
        boolean hasLatitude = data.courierLatitude() != null;
        boolean hasLongitude = data.courierLongitude() != null;
        if (hasLatitude != hasLongitude) {
            throw new DeliveryTelemetryValidationException("Courier latitude and longitude must be supplied together");
        }
        if (!hasLatitude) {
            return;
        }
        if (data.locationObservedAt() == null) {
            throw new DeliveryTelemetryValidationException("Courier location observation timestamp is required");
        }
        if (outside(data.courierLatitude(), -90, 90)) {
            throw new DeliveryTelemetryValidationException("Courier latitude is outside the valid range");
        }
        if (outside(data.courierLongitude(), -180, 180)) {
            throw new DeliveryTelemetryValidationException("Courier longitude is outside the valid range");
        }
    }

    private static boolean outside(BigDecimal value, int minimum, int maximum) {
        return value.compareTo(BigDecimal.valueOf(minimum)) < 0
            || value.compareTo(BigDecimal.valueOf(maximum)) > 0;
    }

    private static void validateWindow(java.time.Instant start, java.time.Instant end, String name) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new DeliveryTelemetryValidationException(
                "Delivery telemetry " + name + " window end cannot be before start"
            );
        }
    }

    private static void requireText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new DeliveryTelemetryValidationException("Delivery telemetry " + field + " is required");
        }
    }

    public static class DeliveryTelemetryValidationException extends RuntimeException {
        public DeliveryTelemetryValidationException(String message) {
            super(message);
        }
    }
}
