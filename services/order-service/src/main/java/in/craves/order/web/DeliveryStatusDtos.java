package in.craves.order.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class DeliveryStatusDtos {
    private DeliveryStatusDtos() {
    }

    public record DeliveryStatusResponse(
        UUID orderId,
        UUID deliveryJobId,
        String providerId,
        String status,
        String trackingUrl,
        String trackingExperience,
        Instant observedAt,
        List<DeliveryStatusHistoryResponse> history,
        DeliveryTelemetryResponse telemetry
    ) {
    }

    public record DeliveryStatusHistoryResponse(
        String oldStatus,
        String newStatus,
        String trackingUrl,
        Instant observedAt,
        Instant recordedAt
    ) {
    }

    public record DeliveryTelemetryResponse(
        boolean liveLocationAvailable,
        BigDecimal courierLatitude,
        BigDecimal courierLongitude,
        Instant locationObservedAt,
        Instant estimatedPickupAt,
        Instant estimatedPickupStartAt,
        Instant estimatedPickupEndAt,
        Instant estimatedDropoffAt,
        Instant estimatedDropoffStartAt,
        Instant estimatedDropoffEndAt,
        Instant telemetryObservedAt
    ) {
    }
}
