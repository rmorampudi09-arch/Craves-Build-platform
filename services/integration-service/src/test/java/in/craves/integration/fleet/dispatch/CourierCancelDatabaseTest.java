package in.craves.integration.fleet.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.command.CourierCancel;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.client.RiderPushClient;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/** CRAVES_DELIVERY_COURIER_CANCEL_ENABLED: a cancelled order's courier is cancelled without the fleet, and only the courier's own record says so. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class CourierCancelDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final DeliveryStatusUpdateService statusUpdates = mock(DeliveryStatusUpdateService.class);
    final DeliveryProviderAdapter borzo = mock(DeliveryProviderAdapter.class);
    final DeliveryProviderAdapter pidge = mock(DeliveryProviderAdapter.class);
    final DeliveryProviderAdapter shiprocket = mock(DeliveryProviderAdapter.class);
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    CourierCancel couriers;

    @BeforeEach
    void setUp() {
        when(borzo.providerId()).thenReturn("borzo");
        when(pidge.providerId()).thenReturn("pidge");
        when(shiprocket.providerId()).thenReturn("shiprocket");
        properties.setCourierCancelEnabled(true);
        couriers = new CourierCancel(fleet.db, properties, List.of(borzo, pidge, shiprocket), statusUpdates);
    }

    @Test
    void theFlagIsOffByDefaultAndTheBeanExistsOnlyWithIt() {
        assertThat(new DeliveryCommandProperties().isCourierCancelEnabled()).isFalse();
        ConditionalOnProperty condition = CourierCancel.class.getAnnotation(ConditionalOnProperty.class);
        assertThat(condition.name()).containsExactly("craves.delivery-command.courier-cancel-enabled");
        assertThat(condition.havingValue()).isEqualTo("true");
        assertThat(condition.matchIfMissing()).isFalse();
    }

    @Test
    void aShiprocketBookingIsCancelledAndRecordedOnlyOnceTheCourierShowsItCancelled() {
        UUID order = UUID.randomUUID();
        UUID job = courierJob(order, "shiprocket", "AWB-1", "COURIER_ASSIGNED");
        UUID refunded = UUID.randomUUID();
        courierJob(refunded, "shiprocket", "AWB-2", "COURIER_ASSIGNED");
        fleet.orderCancelled(order);
        fleet.refundRequested(refunded);
        // Shiprocket's cancel answers CANCELLED at once; its record follows a little later.
        when(shiprocket.cancel("AWB-1")).thenReturn(delivery("shiprocket", "AWB-1", DeliveryStatus.CANCELLED));
        when(shiprocket.track("AWB-1")).thenReturn(seen("shiprocket", "AWB-1", DeliveryStatus.COURIER_ASSIGNED),
            seen("shiprocket", "AWB-1", DeliveryStatus.COURIER_ASSIGNED), seen("shiprocket", "AWB-1", DeliveryStatus.CANCELLED));

        assertThat(couriers.cancelledOrders()).as("still live at Shiprocket after the cancel").isZero();
        assertThat(fleet.db.queryForMap("SELECT reason, attempts, last_error, cancelled_at, alerted_at FROM delivery_schema.courier_cancel "
            + "WHERE provider_delivery_id = 'AWB-1'")).containsEntry("reason", "ORDER_CANCELLED").containsEntry("attempts", 1)
            .containsEntry("last_error", "Shiprocket still shows it COURIER_ASSIGNED after the cancel").containsEntry("cancelled_at", null)
            .containsEntry("alerted_at", null);
        verify(statusUpdates, never()).processTracking(any(), any());
        assertThat(couriers.cancelledOrders()).as("not due again within the attempt window").isZero();

        due("AWB-1");
        assertThat(couriers.cancelledOrders()).isEqualTo(1);

        verify(shiprocket, times(1)).cancel("AWB-1"); // the second attempt found it cancelled and did not ask again
        assertThat(fleet.db.queryForObject("SELECT cancelled_at IS NOT NULL FROM delivery_schema.courier_cancel WHERE provider_delivery_id = "
            + "'AWB-1'", Boolean.class)).isTrue();
        ArgumentCaptor<TrackingWorkItem> item = ArgumentCaptor.forClass(TrackingWorkItem.class);
        ArgumentCaptor<TrackingSnapshot> applied = ArgumentCaptor.forClass(TrackingSnapshot.class);
        verify(statusUpdates).processTracking(item.capture(), applied.capture());
        assertThat(item.getValue().deliveryJobId()).isEqualTo(job);
        assertThat(applied.getValue().delivery().status()).isEqualTo(DeliveryStatus.CANCELLED);
        verify(shiprocket, never()).cancel("AWB-2");
        verify(shiprocket, never()).track("AWB-2");
    }

    @Test
    void aCourierPastCancellingIsNeverCancelledAndOpsIsToldOnce() {
        UUID order = UUID.randomUUID();
        courierJob(order, "borzo", "B-1", "COURIER_ASSIGNED");
        fleet.orderCancelled(order);
        when(borzo.track("B-1")).thenReturn(seen("borzo", "B-1", DeliveryStatus.PICKED_UP));
        List<String> pushed = new java.util.ArrayList<>();
        couriers.opsPush((booking, why) -> pushed.add(booking.providerDeliveryId() + ": " + why));

        assertThat(couriers.cancelledOrders()).isZero();
        due("B-1");
        assertThat(couriers.cancelledOrders()).as("no further attempt").isZero();

        verify(borzo, never()).cancel(anyString());
        verify(borzo, times(1)).track("B-1");
        assertThat(fleet.db.queryForMap("SELECT attempts, last_error, cancelled_at, alerted_at IS NOT NULL AS alerted FROM "
            + "delivery_schema.courier_cancel WHERE provider_delivery_id = 'B-1'")).containsEntry("attempts", CourierCancel.MAX_ATTEMPTS)
            .containsEntry("last_error", "Borzo shows it PICKED_UP").containsEntry("cancelled_at", null).containsEntry("alerted", true);
        assertThat(pushed).containsExactly("B-1: Borzo shows it PICKED_UP");
        verify(statusUpdates, never()).processTracking(any(), any());
    }

    @Test
    void aRefusalIsTriedThreeTimesThenOpsIsToldOnceAndTheCouriersRecordOutranksItsAnswer() {
        UUID refusedOrder = UUID.randomUUID();
        courierJob(refusedOrder, "pidge", "P-1", "SEARCHING");
        UUID cancelledOrder = UUID.randomUUID();
        courierJob(cancelledOrder, "borzo", "B-2", "SEARCHING");
        UUID unreadOrder = UUID.randomUUID();
        courierJob(unreadOrder, "borzo", "B-3", "SEARCHING");
        fleet.orderCancelled(refusedOrder);
        fleet.orderCancelled(cancelledOrder);
        fleet.orderCancelled(unreadOrder);
        when(pidge.track("P-1")).thenReturn(seen("pidge", "P-1", DeliveryStatus.COURIER_ASSIGNED));
        when(pidge.cancel("P-1")).thenThrow(new IllegalStateException("Pidge API HTTP 409 (order_state)"));
        // Borzo's answer was lost, but its record shows the booking cancelled.
        when(borzo.track("B-2")).thenReturn(seen("borzo", "B-2", DeliveryStatus.SEARCHING), seen("borzo", "B-2", DeliveryStatus.CANCELLED));
        when(borzo.cancel("B-2")).thenThrow(new IllegalStateException("read timed out"));
        when(borzo.track("B-3")).thenThrow(new IllegalStateException("Borzo is down"));
        List<String> pushed = new java.util.ArrayList<>();
        couriers.opsPush((booking, why) -> pushed.add(booking.providerDeliveryId()));

        assertThat(couriers.cancelledOrders()).isEqualTo(1);

        assertThat(fleet.db.queryForObject("SELECT cancelled_at IS NOT NULL FROM delivery_schema.courier_cancel WHERE provider_delivery_id = "
            + "'B-2'", Boolean.class)).isTrue();
        verify(borzo, never()).cancel("B-3"); // never cancelled without knowing how far its courier is
        assertThat(pushed).isEmpty();
        for (int tick = 1; tick < CourierCancel.MAX_ATTEMPTS; tick++) {
            due("P-1");
            assertThat(couriers.cancelledOrders()).isZero();
        }
        verify(pidge, times(CourierCancel.MAX_ATTEMPTS)).cancel("P-1");
        assertThat(fleet.db.queryForMap("SELECT attempts, last_error, alerted_at IS NOT NULL AS alerted FROM delivery_schema.courier_cancel "
            + "WHERE provider_delivery_id = 'P-1'")).containsEntry("attempts", CourierCancel.MAX_ATTEMPTS)
            .containsEntry("last_error", "Pidge API HTTP 409 (order_state)").containsEntry("alerted", true);
        assertThat(pushed).containsExactly("P-1");
        assertThat(fleet.db.queryForMap("SELECT attempts, last_error FROM delivery_schema.courier_cancel WHERE provider_delivery_id = 'B-3'"))
            .containsEntry("attempts", 1).containsEntry("last_error", "Borzo is down");
    }

    /** The fleet's own class: untouched without the new bean or with its flag off; with it on, the tick and ops go through CourierCancel. */
    @Test
    void theFleetsCancelStaysAsItIsWithTheFlagOffAndHandsOverWithItOn() {
        RiderPushClient alerts = mock(RiderPushClient.class);
        FleetCourierCancel fleetCancel = new FleetCourierCancel(fleet.db, List.of(borzo, pidge, shiprocket), statusUpdates, alerts);
        UUID order = UUID.randomUUID();
        courierJob(order, "borzo", "B-9", "COURIER_ASSIGNED");
        UUID shiprocketOrder = UUID.randomUUID();
        courierJob(shiprocketOrder, "shiprocket", "AWB-9", "COURIER_ASSIGNED");
        fleet.orderCancelled(order);
        fleet.orderCancelled(shiprocketOrder);
        when(borzo.cancel("B-9")).thenThrow(new IllegalStateException("Borzo cancel-order was rejected"));
        properties.setCourierCancelEnabled(false);
        fleetCancel.setConfirmed(couriers);

        fleetCancel.tick();

        verify(borzo, times(1)).cancel("B-9");
        verify(borzo, never()).track(anyString()); // today's path: no fetch
        verify(shiprocket, never()).cancel(anyString());
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.courier_cancel", Integer.class)).isEqualTo(1);

        properties.setCourierCancelEnabled(true);
        fleetCancel.tick();
        verify(borzo, times(1)).cancel("B-9"); // CourierCancel's tick has it now
        verify(borzo, never()).track(anyString());

        UUID trip = fleet.trip(shiprocketOrder);
        when(shiprocket.track("AWB-9")).thenReturn(seen("shiprocket", "AWB-9", DeliveryStatus.IN_TRANSIT));
        Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx321");
        assertThatThrownBy(() -> fleetCancel.forOps(trip, ops)).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.code()).isEqualTo("TRIP_NOT_CANCELLABLE");
            assertThat(error.getMessage()).contains("Shiprocket didn't cancel delivery AWB-9", "IN_TRANSIT");
        });
        verify(shiprocket, never()).cancel(anyString());
        assertThat(fleet.db.queryForMap("SELECT reason, requested_by FROM delivery_schema.courier_cancel WHERE provider_delivery_id = 'AWB-9'"))
            .containsEntry("reason", "OPS_CANCELLED").containsEntry("requested_by", ops.id());
        verify(alerts, times(1)).opsAlert(eq("FLEET_COURIER_CANCEL_FAILED"), contains("by hand"), contains("AWB-9"), anyMap());
    }

    private void due(String deliveryId) {
        fleet.db.update("UPDATE delivery_schema.courier_cancel SET last_attempt_at = now() - make_interval(secs => ?) "
            + "WHERE provider_delivery_id = ?", CourierCancel.ATTEMPT_SECONDS + 1, deliveryId);
    }

    private UUID courierJob(UUID chefSubOrderId, String provider, String deliveryId, String status) {
        UUID job = UUID.randomUUID();
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, ?, ?, ?)", job, chefSubOrderId, UUID.randomUUID(), provider, deliveryId, status);
        return job;
    }

    private static ProviderDelivery delivery(String provider, String id, DeliveryStatus status) {
        return new ProviderDelivery(provider, id, null, status, status.name(), null, null, null, null, Instant.now());
    }

    private static TrackingSnapshot seen(String provider, String id, DeliveryStatus status) {
        return new TrackingSnapshot(delivery(provider, id, status), null, Instant.now());
    }
}
