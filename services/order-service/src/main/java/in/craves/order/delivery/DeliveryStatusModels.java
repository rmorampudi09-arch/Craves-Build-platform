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
        Boolean handoffContinuation,
        // Optional courier details the provider may report; absent keeps what order-service already stored.
        String courierName,
        String courierPhone,
        String courierPhotoUrl,
        Instant pickupEtaAt
    ) {
        public DeliveryStatusChangedData(
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
            this(deliveryJobId, orderId, chefSubOrderId, providerId,
                providerDeliveryId, status, trackingUrl, observedAt,
                handoffFromProviderId, handoffFromProviderDeliveryId, handoffContinuation,
                null, null, null, null);
        }

        public DeliveryStatusChangedData(
            UUID deliveryJobId,
            UUID orderId,
            UUID chefSubOrderId,
            String providerId,
            String providerDeliveryId,
            String status,
            String trackingUrl,
            Instant observedAt,
            String handoffFromProviderId,
            String handoffFromProviderDeliveryId
        ) {
            this(deliveryJobId, orderId, chefSubOrderId, providerId,
                providerDeliveryId, status, trackingUrl, observedAt,
                handoffFromProviderId, handoffFromProviderDeliveryId, null);
        }

        public DeliveryStatusChangedData(
            UUID deliveryJobId,
            UUID orderId,
            UUID chefSubOrderId,
            String providerId,
            String providerDeliveryId,
            String status,
            String trackingUrl,
            Instant observedAt
        ) {
            this(deliveryJobId, orderId, chefSubOrderId, providerId,
                providerDeliveryId, status, trackingUrl, observedAt, null, null, null);
        }

        public boolean hasHandoff() {
            return handoffFromProviderId != null || handoffFromProviderDeliveryId != null;
        }
    }
}
