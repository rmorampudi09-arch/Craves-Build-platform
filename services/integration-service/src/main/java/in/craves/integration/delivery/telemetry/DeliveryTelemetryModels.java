package in.craves.integration.delivery.telemetry;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class DeliveryTelemetryModels {
    public static final String DELIVERY_TELEMETRY_UPDATED = "DELIVERY_TELEMETRY_UPDATED";
    public static final String EVENT_VERSION = "1.1";

    private DeliveryTelemetryModels() {
    }

    public record EventEnvelope<T>(
        UUID eventId,
        String eventType,
        String eventVersion,
        Instant occurredAt,
        UUID correlationId,
        UUID causationId,
        String source,
        String subject,
        T data
    ) {
    }

    public record TelemetrySnapshot(
        BigDecimal courierLatitude,
        BigDecimal courierLongitude,
        Instant locationObservedAt,
        Instant estimatedPickupAt,
        Instant estimatedPickupStartAt,
        Instant estimatedPickupEndAt,
        Instant estimatedDropoffAt,
        Instant estimatedDropoffStartAt,
        Instant estimatedDropoffEndAt,
        Instant observedAt,
        String source
    ) {
        public boolean hasUsefulData() {
            return (courierLatitude != null && courierLongitude != null)
                || estimatedPickupAt != null
                || estimatedPickupStartAt != null
                || estimatedPickupEndAt != null
                || estimatedDropoffAt != null
                || estimatedDropoffStartAt != null
                || estimatedDropoffEndAt != null;
        }
    }

    public record DeliveryTelemetryUpdatedData(
        UUID deliveryJobId,
        UUID orderId,
        UUID chefSubOrderId,
        String providerId,
        String providerDeliveryId,
        String status,
        BigDecimal courierLatitude,
        BigDecimal courierLongitude,
        Instant locationObservedAt,
        Instant estimatedPickupAt,
        Instant estimatedPickupStartAt,
        Instant estimatedPickupEndAt,
        Instant estimatedDropoffAt,
        Instant estimatedDropoffStartAt,
        Instant estimatedDropoffEndAt,
        Instant observedAt
    ) {
    }
}
