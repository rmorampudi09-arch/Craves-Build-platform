package in.craves.order.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MarketDeliveryPricingTest {
    private final MarketDeliveryPricing pricing = new MarketDeliveryPricing(
        new BigDecimal("5.0"),
        new BigDecimal("75.00"),
        new BigDecimal("8.00")
    );

    @Test
    void pricesAnyRouteUpToFiveKmAtBaseFee() {
        assertThat(pricing.calculate(0).total()).isEqualByComparingTo("75.00");
        assertThat(pricing.calculate(4_999).total()).isEqualByComparingTo("75.00");
        assertThat(pricing.calculate(5_000).total()).isEqualByComparingTo("75.00");
    }

    @Test
    void pricesDistanceBeyondFiveKmInHundredMeterIncrements() {
        var price = pricing.calculate(5_001);

        assertThat(price.extraDistanceKm()).isEqualByComparingTo("0.1");
        assertThat(price.extraDistanceFee()).isEqualByComparingTo("0.80");
        assertThat(price.total()).isEqualByComparingTo("75.80");
    }

    @Test
    void tenKmMatchesCurrentHyperlocalMarketBenchmark() {
        var price = pricing.calculate(10_000);

        assertThat(price.extraDistanceKm()).isEqualByComparingTo("5.0");
        assertThat(price.extraDistanceFee()).isEqualByComparingTo("40.00");
        assertThat(price.total()).isEqualByComparingTo("115.00");
    }
}
