package in.craves.integration.fleet.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.billing.CourierBilling;
import in.craves.integration.delivery.billing.CourierBilling.Admin;
import in.craves.integration.delivery.billing.CourierBilling.InvoiceCheck;
import in.craves.integration.delivery.billing.CourierBilling.InvoiceInput;
import in.craves.integration.delivery.billing.CourierCharges;
import in.craves.integration.delivery.command.CourierCancel;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Courier;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.client.RiderPushClient;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * A cancel's charge row as each canceller writes it: 0 when the courier showed no rider just before Craves cancelled, NULL
 * (unknown) otherwise, never the price the courier shows after the cancel; and what the invoice comparison makes of both.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class CourierCancelChargeDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final DeliveryProviderAdapter borzo = mock(DeliveryProviderAdapter.class);
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final CourierCharges charges = new CourierCharges(fleet.db, properties,
        new DeliveryStatusRepository(fleet.db, JsonMapper.builder().findAndAddModules().build()));
    CourierCancel couriers;
    FleetCourierCancel fleetCancel;

    @BeforeEach
    void setUp() {
        when(borzo.providerId()).thenReturn("borzo");
        properties.setCourierCancelEnabled(true);
        properties.setCourierChargeEnabled(true);
        couriers = new CourierCancel(fleet.db, properties, List.of(borzo), mock(DeliveryStatusUpdateService.class));
        couriers.setCharges(charges);
        fleetCancel = new FleetCourierCancel(fleet.db, List.of(borzo), mock(DeliveryStatusUpdateService.class), mock(RiderPushClient.class));
        fleetCancel.setCharges(charges);
    }

    @Test
    void aCancelIsFreeBeforeARiderUnknownAfterOneAndTheInvoiceCheckReadsBoth() {
        // Every cancelled answer repeats the ₹61 booking price, as Borzo's record likely does.
        cancelledOrder("B-1", DeliveryStatus.SEARCHING, null);
        cancelledOrder("B-2", DeliveryStatus.PENDING, null);
        cancelledOrder("B-3", DeliveryStatus.COURIER_ASSIGNED, new Courier("R-7", "Ravi", null, null, null, null));
        cancelledOrder("B-5", DeliveryStatus.SEARCHING, null);
        assertThat(couriers.cancelledOrders()).isEqualTo(4);

        // The fleet's own cancel (CRAVES_DELIVERY_COURIER_CANCEL_ENABLED off) reads nothing before cancelling: unknown.
        properties.setCourierCancelEnabled(false);
        cancelledOrder("B-4", DeliveryStatus.SEARCHING, null);
        assertThat(fleetCancel.cancelledOrders()).isEqualTo(1);

        Map<String, Long> cancels = new HashMap<>();
        fleet.db.query("SELECT provider_delivery_id, amount_paise FROM delivery_schema.courier_charge WHERE kind = 'CANCEL'",
            row -> { cancels.put(row.getString(1), (Long) row.getObject(2)); });
        Map<String, Long> wanted = new HashMap<>(Map.of("B-1", 0L, "B-2", 0L, "B-5", 0L));
        wanted.put("B-3", null);
        wanted.put("B-4", null);
        assertThat(cancels).isEqualTo(wanted);
        assertThat(fleet.db.queryForList("SELECT DISTINCT amount_paise FROM delivery_schema.courier_charge WHERE kind = 'BOOKING'", Long.class))
            .as("booking rows are as before").containsExactly(6100L);

        // The wallet statement: B-1 and B-4 absent, B-2 at 0, B-3 and B-5 charged ₹40.
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        InvoiceCheck check = new CourierBilling(fleet.db, fleet.transactions).importInvoice(new Admin(UUID.randomUUID(), "Admin"),
            new InvoiceInput("borzo", "WALLET-1", today.minusDays(1), today, "booking_reference,amount,tax,date\nB-2,0,,\nB-3,40,,\nB-5,40,,\n"));
        assertThat(check.rows()).extracting(row -> row.outcome() + " " + row.bookingReference() + " " + row.invoicePaise() + " "
            + row.cravesPaise() + " " + row.differencePaise()).containsExactlyInAnyOrder(
            "AMOUNT_DIFFERS B-5 4000 0 4000", "CRAVES_AMOUNT_UNKNOWN B-3 4000 null null", "NOT_ON_INVOICE B-4 null null null");
        assertThat(check.counts()).containsEntry("MATCHED", 1).as("a free cancel the statement lacks is no difference")
            .containsEntry("NOT_ON_INVOICE", 1);
    }

    /** A live Borzo booking of an order order-service cancelled, booked at ₹61, that Borzo shows as given then cancelled. */
    private void cancelledOrder(String id, DeliveryStatus before, Courier courier) {
        UUID chefSubOrder = UUID.randomUUID();
        UUID order = UUID.randomUUID();
        UUID job = UUID.randomUUID();
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, 'borzo', ?, 'SEARCHING')", job, chefSubOrder, order, id);
        charges.booked(order, chefSubOrder, job, delivery(id, DeliveryStatus.SEARCHING));
        fleet.orderCancelled(chefSubOrder);
        when(borzo.track(id)).thenReturn(new TrackingSnapshot(delivery(id, before), courier, Instant.now()),
            new TrackingSnapshot(delivery(id, DeliveryStatus.CANCELLED), courier, Instant.now()));
        when(borzo.cancel(id)).thenReturn(delivery(id, DeliveryStatus.CANCELLED));
    }

    private static ProviderDelivery delivery(String id, DeliveryStatus status) {
        return new ProviderDelivery("borzo", id, null, status, status.name(), new BigDecimal("61.00"), null, null, null, Instant.now());
    }
}
