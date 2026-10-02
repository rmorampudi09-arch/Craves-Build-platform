package in.craves.integration.delivery.shadowfax;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import org.junit.jupiter.api.Test;

class ShadowfaxStatusMapperTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void acceptedIsOnlySearchingNotAssigned() throws Exception {
        var payload = MAPPER.readTree("""
            {"order_status":"ACCEPTED","sfx_order_id":21030620}
            """);

        assertThat(ShadowfaxStatusMapper.map(payload)).isEqualTo(DeliveryStatus.SEARCHING);
        assertThat(ShadowfaxStatusMapper.isAssigned(ShadowfaxStatusMapper.map(payload))).isFalse();
    }

    @Test
    void allottedSpellingsAreAssigned() throws Exception {
        var marketplace = MAPPER.readTree("""
            {"order_status":"ALLOTTED","sfx_order_id":21030620}
            """);
        var dedicated = MAPPER.readTree("""
            {"order_status":"ALLOTED","sfx_order_id":21030620}
            """);

        assertThat(ShadowfaxStatusMapper.map(marketplace)).isEqualTo(DeliveryStatus.COURIER_ASSIGNED);
        assertThat(ShadowfaxStatusMapper.map(dedicated)).isEqualTo(DeliveryStatus.COURIER_ASSIGNED);
    }

    @Test
    void postPickupCancellationIsNotReusableCancelConfirmation() throws Exception {
        var payload = MAPPER.readTree("""
            {"order_status":"CANCELLED_BY_CUSTOMER","sfx_order_id":21030620}
            """);

        assertThat(ShadowfaxStatusMapper.map(payload)).isEqualTo(DeliveryStatus.FAILED);
    }
}
