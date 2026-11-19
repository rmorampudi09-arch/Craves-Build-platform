package in.craves.integration.delivery.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.billing.CourierBilling.Line;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Courier;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Money on the courier-charge path with known answers: whole paise, no floating point, the rounding rule, and the CSV's refusals. */
class CourierChargeMoneyTest {
    @Test
    void aCouriersRupeesBecomeWholePaiseWithHalfAPaisaRoundedUp() {
        assertThat(CourierCharges.paise(null)).isNull();
        assertThat(CourierCharges.paise(new BigDecimal("49"))).isEqualTo(4900);
        assertThat(CourierCharges.paise(new BigDecimal("49.5"))).isEqualTo(4950);
        assertThat(CourierCharges.paise(new BigDecimal("49.50"))).isEqualTo(4950);
        assertThat(CourierCharges.paise(new BigDecimal("0.01"))).isEqualTo(1);
        assertThat(CourierCharges.paise(new BigDecimal("49.004"))).isEqualTo(4900);
        assertThat(CourierCharges.paise(new BigDecimal("49.005"))).as("half a paisa rounds up").isEqualTo(4901);
        assertThat(CourierCharges.paise(new BigDecimal("0.005"))).isEqualTo(1);
        // 0.1 + 0.2 in binary floating point is 0.30000000000000004; decimal arithmetic gives exactly 30 paise.
        assertThat(CourierCharges.paise(new BigDecimal("0.1").add(new BigDecimal("0.2")))).isEqualTo(30);
        assertThat(CourierCharges.paise(new BigDecimal("92233720368547758.07"))).as("the largest amount a long holds").isEqualTo(Long.MAX_VALUE);
        assertThatThrownBy(() -> CourierCharges.paise(new BigDecimal("92233720368547758.08"))).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void theCouriersPriceIsPidgesDeliveryChargeAndEveryOtherCouriersOrderTotal() {
        assertThat(CourierCharges.price(delivery("borzo", "61.00", "55.00"))).isEqualByComparingTo("61.00");
        assertThat(CourierCharges.price(delivery("pidge", "450.00", "58.00"))).as("450 is what the customer is billed").isEqualByComparingTo("58.00");
    }

    @Test
    void aCancelIsKnownFreeOnlyWhenTheCourierShowedNoRiderJustBefore() {
        Courier rider = new Courier("R-7", "Ravi", null, null, null, null);
        Courier noId = new Courier(" ", null, null, null, null, null);
        assertThat(CourierCharges.beforeRider(seen(DeliveryStatus.PENDING, null))).isTrue();
        assertThat(CourierCharges.beforeRider(seen(DeliveryStatus.SEARCHING, null))).isTrue();
        assertThat(CourierCharges.beforeRider(seen(DeliveryStatus.SEARCHING, noId))).as("a rider without an id is none").isTrue();
        assertThat(CourierCharges.beforeRider(seen(DeliveryStatus.SEARCHING, rider))).isFalse();
        for (DeliveryStatus status : List.of(DeliveryStatus.COURIER_ASSIGNED, DeliveryStatus.COURIER_TO_PICKUP, DeliveryStatus.AT_PICKUP,
            DeliveryStatus.DELAYED, DeliveryStatus.CANCELLED, DeliveryStatus.UNKNOWN)) {
            assertThat(CourierCharges.beforeRider(seen(status, null))).as(status.name()).isFalse();
        }
        assertThat(CourierCharges.beforeRider(null)).as("nothing read").isFalse();
    }

    @Test
    void aCancelRecordsZeroBeforeARiderAndNullOtherwiseNeverTheCouriersPrice() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DeliveryStatusRepository savepoints = mock(DeliveryStatusRepository.class);
        when(savepoints.inSavepoint(any())).thenAnswer(call -> ((java.util.function.Supplier<?>) call.getArgument(0)).get());
        DeliveryCommandProperties on = new DeliveryCommandProperties();
        on.setCourierChargeEnabled(true);
        CourierCharges charges = new CourierCharges(jdbc, on, savepoints);
        UUID order = UUID.randomUUID();
        charges.cancelled(order, order, null, delivery("borzo", "61.00", null), true);
        charges.cancelled(order, order, null, delivery("pidge", "450.00", "58.00"), false);
        verify(jdbc).update(anyString(), eq("borzo"), anyString(), eq(order), eq(order), isNull(), eq("CANCEL"), eq(0L));
        verify(jdbc).update(anyString(), eq("pidge"), anyString(), eq(order), eq(order), isNull(), eq("CANCEL"), isNull());
    }

    @Test
    void withTheFlagOffNothingIsReadOrWritten() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DeliveryStatusRepository savepoints = mock(DeliveryStatusRepository.class);
        CourierCharges charges = new CourierCharges(jdbc, new DeliveryCommandProperties(), savepoints);
        charges.booked(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), delivery("borzo", "61.00", "55.00"));
        charges.cancelled(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), delivery("borzo", "0.00", "0.00"), true);
        verifyNoInteractions(jdbc, savepoints);
    }

    @Test
    void anInvoiceCsvIsReadExactly() {
        List<Line> lines = CourierBilling.parse("﻿booking_reference,amount,tax,date\r\nBZ-1,49.5,8.91,2026-11-02\r\nBZ_2, 61 ,,\r\n"
            + "PG-3,999999999.99,0,\r\n");
        assertThat(lines).containsExactly(new Line(2, "BZ-1", 4950, 891L, LocalDate.of(2026, 11, 2)),
            new Line(3, "BZ_2", 6100, null, null), new Line(4, "PG-3", 99_999_999_999L, 0L, null));
        assertThat(CourierBilling.rupeesToPaise("0.07", "amount")).isEqualTo(7);
        assertThat(CourierBilling.rupeesToPaise("1.1", "amount")).isEqualTo(110);
    }

    @Test
    void anInvoiceCsvThatIsNotExactlyTheFormatIsRefusedWhole() {
        String header = "booking_reference,amount,tax,date\n";
        refused(null, "csv is required");
        refused("booking_reference,amount\nBZ-1,49\n", "line 1 must be exactly");
        refused(header, "line 1 must be exactly");
        refused(header + "BZ-1,49.505,,\n", "line 2: amount is rupees with at most two decimals");
        refused(header + "BZ-1,-49,,\n", "line 2: amount");
        refused(header + "BZ-1,1e3,,\n", "line 2: amount");
        refused(header + "BZ-1,49.,,\n", "line 2: amount");
        refused(header + "BZ-1,1234567890,,\n", "line 2: amount");
        refused(header + "BZ-1,\"1,234.00\",,\n", "line 2: expected four fields");
        refused(header + "BZ-1,1,234.00,,\n", "line 2: expected four fields");
        refused(header + "BZ-1,49,x,\n", "line 2: tax");
        refused(header + "BZ-1,49,,02/11/2026\n", "line 2: date");
        refused(header + "BZ-1,49,,\n\nBZ-2,50,,\n", "line 3: expected four fields");
        refused(header + "BZ 1,49,,\n", "line 2: booking_reference");
        refused(header + "BZ-1,49,,\nBZ-2,50,,\nBZ-1,49,,\n", "line 4: this booking_reference is already on an earlier line");
        assertThatThrownBy(() -> CourierBilling.parse(header + "BZ-1,49,,\n".repeat(60_000))).isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("413");
        StringBuilder many = new StringBuilder(header);
        for (int line = 0; line <= CourierBilling.MAX_LINES; line++) {
            many.append("B").append(line).append(",1,,\n");
        }
        assertThatThrownBy(() -> CourierBilling.parse(many.toString())).hasMessageContaining("413").hasMessageContaining("5000 lines");
    }

    /**
     * The policy settings are a record: no main source but CourierBilling (which stores and shows them) and the
     * migration names their columns, so nothing can be acting on them.
     */
    @Test
    void nothingReadsThePolicySettingsButTheirOwnAdminRoutes() throws IOException {
        try (Stream<Path> files = Files.walk(Path.of("src/main"))) {
            List<String> readers = files.filter(Files::isRegularFile).filter(file -> {
                try {
                    String text = Files.readString(file);
                    return Stream.of("billing_mode", "disputed_fee_borne_by", "tax_rate_bps", "tax_note", "billingMode()",
                        "disputedFeeBorneBy()", "taxRateBps()", "taxNote()").anyMatch(text::contains);
                } catch (IOException | UncheckedIOException unreadable) {
                    return false; // a binary resource
                }
            }).map(file -> file.getFileName().toString()).sorted().toList();
            assertThat(readers).containsExactly("CourierBilling.java", "V199__courier_charge_and_invoice_import.sql");
        }
    }

    private static void refused(String csv, String message) {
        assertThatThrownBy(() -> CourierBilling.parse(csv)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("400")
            .hasMessageContaining(message);
    }

    static TrackingSnapshot seen(DeliveryStatus status, Courier courier) {
        return new TrackingSnapshot(new ProviderDelivery("borzo", "BZ-1", null, status, status.name(), new BigDecimal("61.00"), null, null,
            null, Instant.now()), courier, Instant.now());
    }

    static ProviderDelivery delivery(String courier, String payment, String deliveryFee) {
        return new ProviderDelivery(courier, courier + "-" + UUID.randomUUID().toString().substring(0, 8), null, DeliveryStatus.SEARCHING,
            "new", payment == null ? null : new BigDecimal(payment), deliveryFee == null ? null : new BigDecimal(deliveryFee), null, null,
            Instant.now());
    }
}
