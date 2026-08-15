package in.craves.order.pricing;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CheckoutPricingModels {
    private CheckoutPricingModels() {
    }

    public record QuoteWrite(
        UUID id,
        UUID customerIdentityId,
        UUID deliveryAddressId,
        String currency,
        String cartFingerprint,
        BigDecimal foodSubtotal,
        BigDecimal platformFee,
        BigDecimal foodTaxAdded,
        BigDecimal platformTaxIncluded,
        BigDecimal deliveryTaxIncluded,
        BigDecimal taxAmount,
        BigDecimal totalTaxAmount,
        BigDecimal deliveryFee,
        BigDecimal grandTotal,
        UUID chargePolicyId,
        String deliveryPricingVersion,
        String taxProfileVersion,
        BigDecimal dropoffLatitude,
        BigDecimal dropoffLongitude,
        Instant expiresAt,
        Instant createdAt,
        List<KitchenQuoteWrite> kitchens
    ) {
    }

    public record KitchenQuoteWrite(
        UUID kitchenId,
        String kitchenName,
        BigDecimal pickupLatitude,
        BigDecimal pickupLongitude,
        long roadDistanceMeters,
        long trafficDurationSeconds,
        BigDecimal foodSubtotal,
        BigDecimal platformFee,
        BigDecimal foodTaxAdded,
        BigDecimal platformTaxIncluded,
        BigDecimal deliveryTaxIncluded,
        BigDecimal taxAmount,
        BigDecimal baseDistanceKm,
        BigDecimal baseDeliveryFee,
        BigDecimal extraDistanceKm,
        BigDecimal extraPerKm,
        BigDecimal extraDistanceFee,
        BigDecimal deliveryFee,
        BigDecimal grandTotal
    ) {
    }

    public record StoredQuote(
        UUID id,
        UUID customerIdentityId,
        UUID deliveryAddressId,
        String currency,
        String cartFingerprint,
        BigDecimal foodSubtotal,
        BigDecimal platformFee,
        BigDecimal foodTaxAdded,
        BigDecimal platformTaxIncluded,
        BigDecimal deliveryTaxIncluded,
        BigDecimal taxAmount,
        BigDecimal totalTaxAmount,
        BigDecimal deliveryFee,
        BigDecimal grandTotal,
        UUID chargePolicyId,
        String deliveryPricingVersion,
        String taxProfileVersion,
        BigDecimal dropoffLatitude,
        BigDecimal dropoffLongitude,
        Instant expiresAt,
        Instant consumedAt,
        List<StoredKitchenQuote> kitchens
    ) {
    }

    public record StoredKitchenQuote(
        UUID kitchenId,
        String kitchenName,
        BigDecimal pickupLatitude,
        BigDecimal pickupLongitude,
        long roadDistanceMeters,
        long trafficDurationSeconds,
        BigDecimal foodSubtotal,
        BigDecimal platformFee,
        BigDecimal foodTaxAdded,
        BigDecimal platformTaxIncluded,
        BigDecimal deliveryTaxIncluded,
        BigDecimal taxAmount,
        BigDecimal baseDistanceKm,
        BigDecimal baseDeliveryFee,
        BigDecimal extraDistanceKm,
        BigDecimal extraPerKm,
        BigDecimal extraDistanceFee,
        BigDecimal deliveryFee,
        BigDecimal grandTotal
    ) {
    }
}
