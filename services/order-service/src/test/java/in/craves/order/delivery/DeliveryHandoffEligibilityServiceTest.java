package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class DeliveryHandoffEligibilityServiceTest {
    private final UUID chefSubOrderId = UUID.randomUUID();
    private final UUID checkoutId = UUID.randomUUID();
    private final UUID deliveryJobId = UUID.randomUUID();
    private final String borzoProviderDeliveryId = "borzo-order-1";

    @Test
    void allowsOnlyAcceptedOrdersStillWaitingForAProvider() throws Exception {
        assertThat(eligible("CHEF_ACCEPTED", true, false, null, null)).isTrue();
        assertThat(eligible("PREPARING", true, false, "PENDING", "borzo")).isTrue();
        assertThat(eligible("READY_FOR_PICKUP", true, false, "SEARCHING", "BORZO")).isTrue();
        assertThat(eligible("READY_FOR_PICKUP", true, false, "DELAYED", "borzo")).isTrue();
        assertThat(eligible("READY_FOR_PICKUP", true, false, "DELAYED", "borzo", true))
            .isFalse();
    }

    @Test
    void refusesCancelledRefundedDeliveredOrAssignedOrders() throws Exception {
        assertThat(eligible("READY_FOR_PICKUP", false, false, "SEARCHING", "borzo")).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, true, "SEARCHING", "borzo")).isFalse();
        for (String status : List.of("CANCELLED", "CHEF_REJECTED", "REFUND_PENDING",
            "REFUNDED", "REFUND_FAILED", "OUT_FOR_DELIVERY", "DELIVERED")) {
            assertThat(eligible(status, true, false, "SEARCHING", "borzo"))
                .as(status).isFalse();
        }
        assertThat(eligible("READY_FOR_PICKUP", true, false,
            "COURIER_ASSIGNED", "borzo")).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false,
            "CANCELLED", "borzo")).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false,
            "SEARCHING", "pidge")).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false,
            "SEARCHING", null)).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false,
            null, "borzo")).isFalse();
    }

    @Test
    void onlyACourierOfThisBorzoDeliveryCountsNotACravesRiderEarlierOnTheJob() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        new DeliveryHandoffEligibilityService(jdbc).check(chefSubOrderId, checkoutId, deliveryJobId, borzoProviderDeliveryId);
        org.mockito.Mockito.verify(jdbc).query(contains("AND h.provider_delivery_id = ?"), any(RowMapper.class), eq(deliveryJobId),
            eq(borzoProviderDeliveryId), eq(chefSubOrderId), eq(checkoutId));
    }

    @Test
    void missingOrWrongCheckoutReturnsFalse() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(contains("FROM order_schema.customer_order"),
            any(RowMapper.class), eq(deliveryJobId), eq(borzoProviderDeliveryId), eq(chefSubOrderId), eq(checkoutId)))
            .thenReturn(List.of());

        assertThat(new DeliveryHandoffEligibilityService(jdbc)
            .check(chefSubOrderId, checkoutId, deliveryJobId,
                borzoProviderDeliveryId).eligible()).isFalse();
    }

    @Test
    void refusesDifferentOrPartialProjectedBorzoIdentity() throws Exception {
        assertThat(eligible("READY_FOR_PICKUP", true, false, "SEARCHING", "borzo",
            false, UUID.randomUUID(), borzoProviderDeliveryId)).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false, "SEARCHING", "borzo",
            false, deliveryJobId, "other-borzo-order")).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false, null, null,
            false, deliveryJobId, null)).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false, null, null,
            false, null, borzoProviderDeliveryId)).isFalse();
        assertThat(eligible("READY_FOR_PICKUP", true, false, null, null,
            true, null, null)).isFalse();
    }

    private boolean eligible(String status, boolean accepted, boolean refundRequested,
                             String deliveryStatus, String provider) throws Exception {
        return eligible(status, accepted, refundRequested, deliveryStatus, provider, false);
    }

    private boolean eligible(String status, boolean accepted, boolean refundRequested,
                             String deliveryStatus, String provider,
                             boolean courierPreviouslyAssigned) throws Exception {
        return eligible(status, accepted, refundRequested, deliveryStatus, provider,
            courierPreviouslyAssigned, provider == null ? null : deliveryJobId,
            provider == null ? null : borzoProviderDeliveryId);
    }

    private boolean eligible(String status, boolean accepted, boolean refundRequested,
                             String deliveryStatus, String provider,
                             boolean courierPreviouslyAssigned, UUID projectedJobId,
                             String projectedDeliveryId) throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet row = mock(ResultSet.class);
        when(row.getString("status")).thenReturn(status);
        when(row.getBoolean("chef_accepted")).thenReturn(accepted);
        when(row.getBoolean("refund_requested")).thenReturn(refundRequested);
        when(row.getString("delivery_status")).thenReturn(deliveryStatus);
        when(row.getString("delivery_provider_id")).thenReturn(provider);
        when(row.getObject("delivery_job_id", UUID.class)).thenReturn(projectedJobId);
        when(row.getString("delivery_provider_delivery_id")).thenReturn(projectedDeliveryId);
        when(row.getBoolean("courier_previously_assigned")).thenReturn(courierPreviouslyAssigned);
        when(jdbc.query(contains("FROM order_schema.customer_order"),
            any(RowMapper.class), eq(deliveryJobId), eq(borzoProviderDeliveryId), eq(chefSubOrderId), eq(checkoutId)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(row, 0));
            });

        return new DeliveryHandoffEligibilityService(jdbc)
            .check(chefSubOrderId, checkoutId, deliveryJobId,
                borzoProviderDeliveryId).eligible();
    }
}
