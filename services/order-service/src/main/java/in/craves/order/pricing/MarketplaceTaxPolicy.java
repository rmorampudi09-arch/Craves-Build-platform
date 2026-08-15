package in.craves.order.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class MarketplaceTaxPolicy {
    public static final String VERSION = "IN_MARKETPLACE_GST_2026_08_V1";
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final BigDecimal restaurantGstPercent;
    private final BigDecimal feeInclusiveGstPercent;

    public MarketplaceTaxPolicy(
        @Value("${craves.checkout-pricing.tax.restaurant-gst-percent:5.00}") BigDecimal restaurantGstPercent,
        @Value("${craves.checkout-pricing.tax.fee-inclusive-gst-percent:18.00}") BigDecimal feeInclusiveGstPercent
    ) {
        this.restaurantGstPercent = rate(restaurantGstPercent, "restaurantGstPercent");
        this.feeInclusiveGstPercent = rate(feeInclusiveGstPercent, "feeInclusiveGstPercent");
    }

    public TaxBreakdown calculate(
        BigDecimal foodSubtotal,
        BigDecimal platformFeeGross,
        BigDecimal deliveryFeeGross
    ) {
        BigDecimal food = money(foodSubtotal);
        BigDecimal platform = money(platformFeeGross);
        BigDecimal delivery = money(deliveryFeeGross);

        BigDecimal foodTaxAdded = percentage(food, restaurantGstPercent);
        BigDecimal platformTaxIncluded = includedTax(platform, feeInclusiveGstPercent);
        BigDecimal deliveryTaxIncluded = includedTax(delivery, feeInclusiveGstPercent);
        BigDecimal totalTaxAmount = foodTaxAdded
            .add(platformTaxIncluded)
            .add(deliveryTaxIncluded)
            .setScale(2, RoundingMode.HALF_UP);

        return new TaxBreakdown(
            VERSION,
            restaurantGstPercent,
            feeInclusiveGstPercent,
            foodTaxAdded,
            platformTaxIncluded,
            deliveryTaxIncluded,
            foodTaxAdded,
            totalTaxAmount
        );
    }

    private static BigDecimal percentage(BigDecimal amount, BigDecimal percent) {
        return amount.multiply(percent)
            .divide(HUNDRED, 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal includedTax(BigDecimal grossAmount, BigDecimal percent) {
        if (grossAmount.signum() == 0 || percent.signum() == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return grossAmount.multiply(percent)
            .divide(HUNDRED.add(percent), 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal money(BigDecimal value) {
        if (value == null || value.signum() < 0) {
            throw new IllegalArgumentException("Amounts must be non-negative");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal rate(BigDecimal value, String name) {
        if (value == null || value.signum() < 0 || value.compareTo(HUNDRED) > 0) {
            throw new IllegalArgumentException(name + " must be between 0 and 100");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    public record TaxBreakdown(
        String version,
        BigDecimal restaurantGstPercent,
        BigDecimal feeInclusiveGstPercent,
        BigDecimal foodTaxAdded,
        BigDecimal platformTaxIncluded,
        BigDecimal deliveryTaxIncluded,
        BigDecimal taxAmountAddedToCheckout,
        BigDecimal totalTaxAmount
    ) {
    }
}
