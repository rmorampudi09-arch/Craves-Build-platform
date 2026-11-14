package in.craves.order.web;

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
        Instant observedAt,
        List<DeliveryStatusHistoryResponse> history,
        // Only while a Craves rider carries the order; customer endpoint only.
        String deliveryCode,
        // Only while a Craves rider carries the order (picked up to drop); customer endpoint only.
        CourierLocationResponse courierLocation,
        String routePath
    ) {
    }

    public record CourierLocationResponse(double latitude, double longitude, Instant observedAt) {
    }

    public record DeliveryStatusHistoryResponse(
        String oldStatus,
        String newStatus,
        String trackingUrl,
        Instant observedAt,
        Instant recordedAt
    ) {
    }
}
