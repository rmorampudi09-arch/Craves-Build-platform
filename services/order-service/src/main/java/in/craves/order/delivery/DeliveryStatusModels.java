package in.craves.order.delivery;

import java.time.Instant;
import java.util.UUID;

public final class DeliveryStatusModels {
    private DeliveryStatusModels() {
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

    public record DeliveryStatusChangedData(
        UUID deliveryJobId,
        UUID orderId,
        UUID chefSubOrderId,
        String providerId,
        String providerDeliveryId,
        String status,
        String trackingUrl,
        Instant observedAt,
        String handoffFromProviderId,
        String handoffFromProviderDeliveryId,
        Boolean handoffContinuation
    ) {
        public DeliveryStatusChangedData(UUID deliveryJobId, UUID orderId, UUID chefSubOrderId,
                                         String providerId, String providerDeliveryId, String status,
                                         String trackingUrl, Instant observedAt) {
            this(deliveryJobId, orderId, chefSubOrderId, providerId, providerDeliveryId,
                status, trackingUrl, observedAt, null, null, null);
        }

        public boolean hasHandoff() {
            return handoffFromProviderId != null || handoffFromProviderDeliveryId != null
                || handoffContinuation != null;
        }
    }
}
