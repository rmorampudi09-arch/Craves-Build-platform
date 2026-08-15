package in.craves.order.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MarketplaceTaxPolicyTest {
    private final MarketplaceTaxPolicy policy = new MarketplaceTaxPolicy(
        new BigDecimal("5.00"),
        new BigDecimal("18.00")
    );

    @Test
    void addsRestaurantGstAndKeepsFeeTaxesInsideDisplayedFees() {
        var taxes = policy.calculate(
            new BigDecimal("200.00"),
            new BigDecimal("10.00"),
            new BigDecimal("75.00")
        );

        assertThat(taxes.foodTaxAdded()).isEqualByComparingTo("10.00");
        assertThat(taxes.taxAmountAddedToCheckout()).isEqualByComparingTo("10.00");
        assertThat(taxes.platformTaxIncluded()).isEqualByComparingTo("1.53");
        assertThat(taxes.deliveryTaxIncluded()).isEqualByComparingTo("11.44");
        assertThat(taxes.totalTaxAmount()).isEqualByComparingTo("22.97");
    }
}
