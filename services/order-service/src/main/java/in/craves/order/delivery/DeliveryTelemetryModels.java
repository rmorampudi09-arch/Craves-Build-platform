package in.craves.order.delivery;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class DeliveryTelemetryModels {
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
