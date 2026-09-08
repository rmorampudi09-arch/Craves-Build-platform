package in.craves.integration.delivery.shadowfax;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import org.junit.jupiter.api.Test;

class ShadowfaxStatusMapperTest {
    private final ShadowfaxStatusMapper mapper = new ShadowfaxStatusMapper();

    @Test
    void mapsThePublishedHyperlocalLifecycle() {
        assertThat(mapper.fromProvider("ACCEPTED")).isEqualTo(DeliveryStatus.SEARCHING);
        assertThat(mapper.fromProvider("ALLOTTED")).isEqualTo(DeliveryStatus.COURIER_ASSIGNED);
        assertThat(mapper.fromProvider("ARRIVED")).isEqualTo(DeliveryStatus.AT_PICKUP);
        assertThat(mapper.fromProvider("DISPATCHED")).isEqualTo(DeliveryStatus.IN_TRANSIT);
        assertThat(mapper.fromProvider("ARRIVED_CUSTOMER_DOORSTEP")).isEqualTo(DeliveryStatus.AT_DROPOFF);
        assertThat(mapper.fromProvider("DELIVERED")).isEqualTo(DeliveryStatus.DELIVERED);
        assertThat(mapper.fromProvider("CANCELLED")).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(mapper.fromProvider("CANCELLED_BY_CUSTOMER")).isEqualTo(DeliveryStatus.RETURNING);
        assertThat(mapper.fromProvider("RETURNED_TO_SELLER")).isEqualTo(DeliveryStatus.RETURNED);
        assertThat(mapper.fromProvider("NEW_VENDOR_STATE")).isEqualTo(DeliveryStatus.UNKNOWN);
    }
}
