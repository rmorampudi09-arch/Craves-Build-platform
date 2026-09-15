package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DeliveryCommercialOrderStatusProjectionTest {

    @Test
    void movesReadyOrderToOutForDeliveryAfterPickup() {
        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "READY_FOR_PICKUP",
            "PICKED_UP"
        )).isEqualTo("OUT_FOR_DELIVERY");

        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "READY_FOR_PICKUP",
            "IN_TRANSIT"
        )).isEqualTo("OUT_FOR_DELIVERY");

        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "READY_FOR_PICKUP",
            "AT_DROPOFF"
        )).isEqualTo("OUT_FOR_DELIVERY");
    }

    @Test
    void movesReadyOrOutForDeliveryOrderToDelivered() {
        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "READY_FOR_PICKUP",
            "DELIVERED"
        )).isEqualTo("DELIVERED");

        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "OUT_FOR_DELIVERY",
            "DELIVERED"
        )).isEqualTo("DELIVERED");
    }

    @Test
    void doesNotAdvanceBeforePickup() {
        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "READY_FOR_PICKUP",
            "SEARCHING"
        )).isEqualTo("READY_FOR_PICKUP");

        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "READY_FOR_PICKUP",
            "COURIER_ASSIGNED"
        )).isEqualTo("READY_FOR_PICKUP");

        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "READY_FOR_PICKUP",
            "AT_PICKUP"
        )).isEqualTo("READY_FOR_PICKUP");
    }

    @Test
    void preservesTerminalOrRefundCommercialStates() {
        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "CANCELLED",
            "DELIVERED"
        )).isEqualTo("CANCELLED");

        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "REFUND_PENDING",
            "DELIVERED"
        )).isEqualTo("REFUND_PENDING");

        assertThat(DeliveryStatusUpdateService.commercialStatusForDelivery(
            "REFUNDED",
            "DELIVERED"
        )).isEqualTo("REFUNDED");
    }
}
