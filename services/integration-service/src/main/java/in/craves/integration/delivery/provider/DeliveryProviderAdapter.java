package in.craves.integration.delivery.provider;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Provider-neutral contract used by the Integration Service delivery worker.
 * One adapter implementation exists per external delivery provider.
 */
public interface DeliveryProviderAdapter {
    String providerId();

    ProviderQuote quote(QuoteRequest request);

    ProviderDelivery create(CreateDeliveryRequest request);

    ProviderDelivery cancel(String providerDeliveryId);

    TrackingSnapshot track(String providerDeliveryId);

    enum DeliveryStatus {
        PENDING,
        SEARCHING,
        COURIER_ASSIGNED,
        COURIER_TO_PICKUP,
        AT_PICKUP,
        PICKED_UP,
        IN_TRANSIT,
        AT_DROPOFF,
        DELIVERED,
        CANCELLED,
        DELAYED,
        RETURNING,
        RETURNED,
        FAILED,
        UNKNOWN
    }

    record Stop(
        String address,
        String contactName,
        String contactPhone,
        BigDecimal latitude,
        BigDecimal longitude,
        OffsetDateTime requiredStart,
        OffsetDateTime requiredFinish,
        String note
    ) {}

    record QuoteRequest(
        String matter,
        int totalWeightKg,
        boolean thermoboxRequired,
        Stop pickup,
        Stop dropoff
    ) {}

    record CreateDeliveryRequest(
        String clientReference,
        QuoteRequest quoteRequest
    ) {}

    record ProviderQuote(
        String providerId,
        boolean available,
        BigDecimal paymentAmount,
        BigDecimal deliveryFeeAmount,
        String currency,
        List<String> warnings,
        JsonNode providerMetadata,
        Instant quotedAt
    ) {}

    record ProviderDelivery(
        String providerId,
        String providerDeliveryId,
        String providerOrderName,
        DeliveryStatus status,
        String providerStatus,
        BigDecimal paymentAmount,
        BigDecimal deliveryFeeAmount,
        String trackingUrl,
        JsonNode providerMetadata,
        Instant observedAt
    ) {}

    record Courier(
        String providerCourierId,
        String name,
        String phone,
        String photoUrl,
        BigDecimal latitude,
        BigDecimal longitude
    ) {}

    record TrackingSnapshot(
        ProviderDelivery delivery,
        Courier courier,
        Instant observedAt
    ) {}
}
