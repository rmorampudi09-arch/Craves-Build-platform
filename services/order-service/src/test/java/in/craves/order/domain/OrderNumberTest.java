package in.craves.order.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderNumberTest {
    @Test
    void isTheFirstEightCharactersWithoutDashesInCapitalsLikeWebShortOrderNumber() {
        // Same id and expected value as apps/customer-web-next/src/shared/lib/order-number.test.ts.
        assertThat(OrderNumber.of(UUID.fromString("0bde0000-0000-4000-8000-000000000101"))).isEqualTo("0BDE0000");
        assertThat(OrderNumber.of(UUID.fromString("397aeab4-4df3-489d-881a-796c68cfba3c"))).isEqualTo("397AEAB4");
    }
}
