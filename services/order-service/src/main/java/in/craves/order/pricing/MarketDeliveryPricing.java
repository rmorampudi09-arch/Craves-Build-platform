package in.craves.order.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class MarketDeliveryPricing {
    public static final String VERSION = "HYDERABAD_MARKET_2026_08_V1";

    private final BigDecimal baseDistanceKm;
    private final BigDecimal baseFee;
    private final BigDecimal extraPerKm;

    public MarketDeliveryPricing(
        @Value("${craves.checkout-pricing.delivery.base-distance-km:5.0}") BigDecimal baseDistanceKm,
        @Value("${craves.checkout-pricing.delivery.base-fee:75.00}") BigDecimal baseFee,
        @Value("${craves.checkout-pricing.delivery.extra-per-km:8.00}") BigDecimal extraPerKm
    ) {
        this.baseDistanceKm = positive(baseDistanceKm, "baseDistanceKm");
        this.baseFee = nonNegative(baseFee, "baseFee").setScale(2, RoundingMode.HALF_UP);
        this.extraPerKm = nonNegative(extraPerKm, "extraPerKm").setScale(2, RoundingMode.HALF_UP);
    }

    public DeliveryPrice calculate(long roadDistanceMeters) {
        if (roadDistanceMeters < 0) {
            throw new IllegalArgumentException("roadDistanceMeters cannot be negative");
        }

        BigDecimal roadDistanceKm = BigDecimal.valueOf(roadDistanceMeters)
            .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);
        BigDecimal rawExtraKm = roadDistanceKm.subtract(baseDistanceKm).max(BigDecimal.ZERO);
        BigDecimal billableExtraKm = rawExtraKm.signum() == 0
            ? BigDecimal.ZERO.setScale(1)
            : rawExtraKm.setScale(1, RoundingMode.CEILING);
        BigDecimal extraDistanceFee = billableExtraKm.multiply(extraPerKm)
            .setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = baseFee.add(extraDistanceFee).setScale(2, RoundingMode.HALF_UP);

        return new DeliveryPrice(
            VERSION,
            roadDistanceKm,
            baseDistanceKm,
            baseFee,
            billableExtraKm,
            extraPerKm,
            extraDistanceFee,
            total
        );
    }

    private static BigDecimal positive(BigDecimal value, String name) {
        if (value == null || value.signum() <= 0) {
            throw new IllegalArgumentException(name + " must be positive");
        }
        return value;
    }

    private static BigDecimal nonNegative(BigDecimal value, String name) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException(name + " cannot be negative");
        }
        return value;
    }

    public record DeliveryPrice(
        String version,
        BigDecimal roadDistanceKm,
        BigDecimal baseDistanceKm,
        BigDecimal baseFee,
        BigDecimal extraDistanceKm,
        BigDecimal extraPerKm,
        BigDecimal extraDistanceFee,
        BigDecimal total
    ) {
    }
}
