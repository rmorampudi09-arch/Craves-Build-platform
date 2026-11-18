package in.craves.integration.delivery.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStrategy;
import in.craves.integration.delivery.billing.CourierBilling.Admin;
import in.craves.integration.delivery.billing.CourierBilling.InvoiceCheck;
import in.craves.integration.delivery.billing.CourierBilling.InvoiceInput;
import in.craves.integration.delivery.billing.CourierBilling.Setting;
import in.craves.integration.delivery.billing.CourierBilling.SettingInput;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.DeliveryCommandCompletionService;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryJobRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import in.craves.integration.fleet.FleetDatabase;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * Courier charges, the invoice import and the billing settings on PostgreSQL with every migration: what is written when a
 * booking is confirmed or cancelled, that a failed write leaves the booking alone, that the rows cannot be changed, and
 * the comparison's outcomes with known amounts.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class CourierChargeDatabaseTest {
    static final String CHARGES = "SELECT kind, amount_paise, currency, source, provider_id FROM delivery_schema.courier_charge ORDER BY id";
    final FleetDatabase database = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final DeliveryCommandRepository commands = new DeliveryCommandRepository(database.db, json);
    final CourierCharges charges = new CourierCharges(database.db, properties, new DeliveryStatusRepository(database.db, json));
    final CourierBilling billing = new CourierBilling(database.db, database.transactions);
    final TransactionTemplate transaction = new TransactionTemplate(database.transactions);
    final Admin admin = new Admin(UUID.randomUUID(), "Admin +91xxxxxx0000");
    final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
    /** Appended to from whichever thread logs. */
    final List<String> alerts = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            if (event.getFormattedMessage().startsWith("CRAVES_ALERT")) {
                alerts.add(event.getFormattedMessage());
            }
        }
    };
    DeliveryCommandCompletionService completion;

    @BeforeEach
    void setUp() {
        properties.setCourierChargeEnabled(true);
        completion = new DeliveryCommandCompletionService(mock(DeliveryAssignmentRepository.class), new DeliveryJobRepository(database.db, json),
            new DeliveryOutboxRepository(database.db, json), commands, json, mock(BorzoPidgeHandoffRepository.class), properties);
        completion.setCharges(charges);
        logged.start();
        ((Logger) LoggerFactory.getLogger(CourierCharges.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() {
        ((Logger) LoggerFactory.getLogger(CourierCharges.class)).detachAppender(logged);
    }

    @Test
    void aConfirmedBookingWritesItsPriceOnceAndACancelWritesOnlyWhatTheCourierShowsThen() {
        ProviderDelivery borzo = delivery("borzo", "BZ-1", "61.50", "55.00");
        UUID order = book(borzo);
        assertThat(database.db.queryForList(CHARGES)).containsExactly(Map.of("kind", "BOOKING", "amount_paise", 6150L, "currency", "INR",
            "source", "API", "provider_id", "borzo"));
        charges.booked(order, order, UUID.randomUUID(), borzo);
        assertThat(count("courier_charge")).as("the same booking again writes nothing").isEqualTo(1);
        assertThat(expected("BZ-1")).isEqualTo(6150L);

        // Borzo's record once cancelled shows ₹20: the booking is expected to cost that, not 61.50 + 20.
        ProviderDelivery cancelled = new ProviderDelivery("borzo", "BZ-1", null, DeliveryStatus.CANCELLED, "canceled", new BigDecimal("20.00"),
            null, null, null, Instant.now());
        charges.cancelled(order, order, null, cancelled);
        charges.cancelled(order, order, null, cancelled);
        assertThat(database.db.queryForList(CHARGES)).extracting(row -> row.get("kind") + " " + row.get("amount_paise"))
            .containsExactly("BOOKING 6150", "CANCEL 2000");
        assertThat(expected("BZ-1")).as("a cancel counts only its own amount").isEqualTo(2000L);

        // Pidge's price is its delivery charge, not the customer's bill; an answer without a price is kept as unknown.
        book(delivery("pidge", "PG-1", "450.00", "58.00"));
        book(delivery("pidge", "PG-2", "450.00", null));
        assertThat(expected("PG-1")).isEqualTo(5800L);
        assertThat(expected("PG-2")).isNull();
        assertThat(database.db.queryForObject("SELECT sum(expected_paise) FROM delivery_schema.courier_booking_charge", Long.class))
            .as("the courier total is the sum of its charges").isEqualTo(2000L + 5800L);
        assertThat(alerts).isEmpty();
    }

    @Test
    void withTheFlagOffABookingWritesNoCharge() {
        properties.setCourierChargeEnabled(false);
        book(delivery("borzo", "BZ-1", "61.50", "55.00"));
        assertThat(count("delivery_job")).isEqualTo(1);
        assertThat(count("courier_charge")).isZero();
    }

    @Test
    void aChargeThatCannotBeWrittenLeavesTheBookingAsItIsAndSaysSoOnce() {
        // A negative price breaks the table's rule, inside the booking's transaction.
        UUID order = book(delivery("borzo", "BZ-1", "-5.00", null));
        assertThat(database.db.queryForObject("SELECT provider_delivery_id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?",
            String.class, order)).as("the booking is the order's delivery all the same").isEqualTo("BZ-1");
        assertThat(database.db.queryForObject("SELECT status FROM delivery_schema.delivery_command WHERE chef_sub_order_id = ?", String.class,
            order)).isEqualTo("COMPLETED");
        assertThat(count("delivery_outbox")).as("and order-service is told").isEqualTo(1);
        assertThat(count("courier_charge")).isZero();
        assertThat(alerts).hasSize(1).first().asString().startsWith("CRAVES_ALERT alert=COURIER_CHARGE_NOT_RECORDED provider=borzo")
            .contains("delivery=BZ-1 kind=BOOKING");

        // An amount no long can hold never reaches the database.
        book(delivery("borzo", "BZ-2", "92233720368547758.08", null));
        assertThat(count("delivery_job")).isEqualTo(2);
        assertThat(alerts).hasSize(2);
    }

    @Test
    void chargeImportAndSettingRowsCannotBeChangedOrDeleted() {
        book(delivery("borzo", "BZ-1", "61.50", null));
        billing.save(admin, "borzo", new SettingInput("POSTPAID_INVOICE", null, null, "UNDECIDED", null, null));
        billing.importInvoice(admin, invoice("INV-1", "booking_reference,amount,tax,date\nBZ-1,61.50,,\n"));
        Map<String, String> amounts = Map.of("courier_charge", "amount_paise", "courier_billing_setting", "per_day_alert_paise",
            "courier_invoice_import", "total_paise", "courier_invoice_line", "amount_paise");
        for (String table : amounts.keySet()) {
            assertThatThrownBy(() -> database.db.update("UPDATE delivery_schema." + table + " SET " + amounts.get(table) + " = 1")).as(table)
                .hasMessageContaining(table + " is append-only");
            assertThatThrownBy(() -> database.db.update("DELETE FROM delivery_schema." + table)).as(table)
                .hasMessageContaining(table + " is append-only");
            assertThat(count(table)).isEqualTo(1);
        }
    }

    @Test
    void anAlertThresholdWritesOneLineAndNeverStopsABooking() {
        book(delivery("borzo", "BZ-1", "500.00", null));
        assertThat(alerts).as("no thresholds until an admin sets one").isEmpty();

        billing.save(admin, "borzo", new SettingInput("UNKNOWN", null, null, "UNDECIDED", 10_000L, 70_000L));
        book(delivery("borzo", "BZ-2", "100.00", null));
        assertThat(alerts).as("₹100 is not over ₹100, and the day is at ₹600").isEmpty();
        book(delivery("borzo", "BZ-3", "100.01", null));
        assertThat(alerts).hasSize(2);
        assertThat(alerts.get(0)).startsWith("CRAVES_ALERT alert=COURIER_CHARGE_OVER_ORDER_THRESHOLD provider=borzo")
            .contains("delivery=BZ-3 amountPaise=10001 thresholdPaise=10000");
        assertThat(alerts.get(1)).isEqualTo("CRAVES_ALERT alert=COURIER_SPEND_OVER_DAY_THRESHOLD provider=borzo bookedTodayPaise=70001 "
            + "thresholdPaise=70000");
        book(delivery("borzo", "BZ-4", "50.00", null));
        assertThat(alerts).as("the day's alert is written once").hasSize(2);
        book(delivery("pidge", "PG-1", null, "900.00"));
        assertThat(alerts).as("Pidge has no threshold").hasSize(2);
        assertThat(count("delivery_job")).as("every booking was made").isEqualTo(5);
        assertThat(count("courier_charge")).isEqualTo(5);
    }

    @Test
    void anImportedInvoiceIsComparedLineByLineToThePaisa() {
        book(delivery("borzo", "BZ-1", "61.50", null));
        book(delivery("borzo", "BZ-2", "49.00", null));
        book(delivery("borzo", "BZ-3", "70.00", null));
        UUID cancelledOrder = book(delivery("borzo", "BZ-4", "55.00", null));
        charges.cancelled(cancelledOrder, cancelledOrder, null, delivery("borzo", "BZ-4", "0.00", null));
        book(delivery("borzo", "BZ-5", null, null));
        book(delivery("pidge", "PG-1", null, "58.00"));

        String csv = "booking_reference,amount,tax,date\nBZ-1,61.50,11.07,\nBZ-2,52.25,,\nBZ-9,40,,\nBZ-5,30,,\n";
        InvoiceCheck check = billing.importInvoice(admin, invoice("INV/2026-11", csv));
        assertThat(check.duplicate()).isFalse();
        assertThat(check.invoice().lineCount()).isEqualTo(4);
        assertThat(check.invoice().totalPaise()).isEqualTo(6150 + 5225 + 4000 + 3000);
        assertThat(check.invoice().currency()).isEqualTo("INR");
        assertThat(check.invoice().importedByName()).isEqualTo(admin.name());
        assertThat(database.db.queryForObject("SELECT imported_by FROM delivery_schema.courier_invoice_import", UUID.class)).isEqualTo(admin.id());
        assertThat(check.counts()).containsExactly(Map.entry("MATCHED", 1), Map.entry("AMOUNT_DIFFERS", 1), Map.entry("NOT_IN_CRAVES", 1),
            Map.entry("CRAVES_AMOUNT_UNKNOWN", 1), Map.entry("NOT_ON_INVOICE", 1));
        assertThat(check.netDifferencePaise()).as("₹52.25 billed against ₹49.00 recorded").isEqualTo(325);
        assertThat(check.rows()).extracting(row -> row.outcome() + " " + row.bookingReference() + " " + row.invoicePaise() + " "
            + row.cravesPaise() + " " + row.differencePaise()).containsExactly("AMOUNT_DIFFERS BZ-2 5225 4900 325",
            "CRAVES_AMOUNT_UNKNOWN BZ-5 3000 null null", "NOT_IN_CRAVES BZ-9 4000 null null", "NOT_ON_INVOICE BZ-3 null 7000 null");
        assertThat(check.rows().get(3).deliveryStatus()).isEqualTo("SEARCHING");
        assertThat(database.db.queryForObject("SELECT tax_paise FROM delivery_schema.courier_invoice_line WHERE provider_delivery_id = 'BZ-1'",
            Long.class)).isEqualTo(1107L);

        // The same file again, with other line endings: the stored import comes back and nothing is written.
        InvoiceCheck again = billing.importInvoice(admin, invoice("INV/2026-11", csv.replace("\n", "\r\n")));
        assertThat(again.duplicate()).isTrue();
        assertThat(again.invoice()).isEqualTo(check.invoice());
        assertThat(again.rows()).isEqualTo(check.rows());
        assertThat(count("courier_invoice_import")).isEqualTo(1);
        assertThat(count("courier_invoice_line")).isEqualTo(4);

        assertThatThrownBy(() -> billing.importInvoice(admin, invoice("INV/2026-11", csv + "BZ-3,70,,\n")))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        assertThatThrownBy(() -> billing.importInvoice(admin, invoice("INV-BAD", csv + "BZ-3,70.001,,\n")))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("line 6");
        assertThat(count("courier_invoice_import")).as("a refused file stores nothing").isEqualTo(1);

        // A corrected invoice under a new reference: every line now equals what Craves recorded.
        InvoiceCheck corrected = billing.importInvoice(admin, invoice("INV/2026-11-R1",
            "booking_reference,amount,tax,date\nBZ-1,61.50,,\nBZ-2,49,,\nBZ-3,70.00,,\n"));
        assertThat(corrected.counts()).containsEntry("MATCHED", 3).containsEntry("AMOUNT_DIFFERS", 0).containsEntry("NOT_IN_CRAVES", 0)
            .containsEntry("NOT_ON_INVOICE", 1);
        assertThat(corrected.rows()).as("the booking with no known price is still not on it").extracting(row -> row.bookingReference())
            .containsExactly("BZ-5");
        assertThat(billing.check(check.invoice().importId(), false).rows()).isEqualTo(check.rows());
        assertThat(billing.imports()).extracting(row -> row.invoiceRef()).containsExactly("INV/2026-11-R1", "INV/2026-11");

        assertThat(count("delivery_job")).as("an import changes no booking").isEqualTo(6);
        assertThat(count("courier_charge")).as("and writes no charge").isEqualTo(7);
        assertThat(alerts).isEmpty();
    }

    @Test
    void anInvoiceIsRefusedForAnUnknownCourierABadReferenceOrABadPeriod() {
        String csv = "booking_reference,amount,tax,date\nBZ-1,61.50,,\n";
        for (InvoiceInput bad : List.of(new InvoiceInput("shiprocket", "INV-1", today, today, csv),
            new InvoiceInput("borzo", "INV 1", today, today, csv), new InvoiceInput("borzo", "INV-1", today, today.minusDays(1), csv),
            new InvoiceInput("borzo", "INV-1", today.minusDays(92), today, csv), new InvoiceInput("borzo", "INV-1", null, today, csv))) {
            assertThatThrownBy(() -> billing.importInvoice(admin, bad)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        }
        assertThat(count("courier_invoice_import")).isZero();
    }

    @Test
    void settingsStartNeutralAndEverySaveIsANewVersionWithItsAdmin() {
        assertThat(billing.settings()).containsExactly(new Setting("borzo", "UNKNOWN", null, null, "UNDECIDED", null, null, null, null),
            new Setting("pidge", "UNKNOWN", null, null, "UNDECIDED", null, null, null, null));

        Setting saved = billing.save(admin, "pidge", new SettingInput("PREPAID_WALLET", " Prices include GST ", 1800, "CRAVES", 15_000L, null));
        assertThat(saved.billingMode()).isEqualTo("PREPAID_WALLET");
        assertThat(saved.taxNote()).isEqualTo("Prices include GST");
        assertThat(saved.taxRateBps()).isEqualTo(1800);
        assertThat(saved.perOrderAlertPaise()).isEqualTo(15_000L);
        assertThat(saved.changedByName()).isEqualTo(admin.name());
        billing.save(admin, "pidge", new SettingInput("POSTPAID_INVOICE", null, null, "UNDECIDED", null, null));
        assertThat(billing.settings().get(1).billingMode()).isEqualTo("POSTPAID_INVOICE");
        assertThat(billing.settings().get(1).perOrderAlertPaise()).as("a threshold left empty is removed").isNull();
        assertThat(billing.settings().get(0).changedAt()).as("Borzo is untouched").isNull();
        assertThat(database.db.queryForList("SELECT billing_mode FROM delivery_schema.courier_billing_setting WHERE changed_by = ? ORDER BY id",
            String.class, admin.id())).as("both versions are kept").containsExactly("PREPAID_WALLET", "POSTPAID_INVOICE");

        for (SettingInput bad : List.of(new SettingInput("WALLET", null, null, "UNDECIDED", null, null),
            new SettingInput("UNKNOWN", null, null, "RIDER", null, null), new SettingInput("UNKNOWN", null, 10_001, "UNDECIDED", null, null),
            new SettingInput("UNKNOWN", null, null, "UNDECIDED", 0L, null), new SettingInput("UNKNOWN", "x".repeat(501), null, "UNDECIDED", null, null))) {
            assertThatThrownBy(() -> billing.save(admin, "pidge", bad)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        }
        assertThatThrownBy(() -> billing.save(admin, "shadowfax", new SettingInput("UNKNOWN", null, null, "UNDECIDED", null, null)))
            .hasMessageContaining("courier must be borzo or pidge");
        assertThat(count("courier_billing_setting")).isEqualTo(2);
    }

    /** A new order's booking confirmed as the command worker confirms it: in one transaction. Returns the order's id. */
    private UUID book(ProviderDelivery delivery) {
        UUID order = UUID.randomUUID();
        Stop stop = new Stop("Madhapur, Hyderabad", "Chef", "919999999991", new BigDecimal("17.4483"), new BigDecimal("78.3915"), null, null, null);
        DeliveryCommandMessage message = new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), order, order, order,
            Instant.now().plusSeconds(600), Instant.now(), order.toString(), 4.6, "Madhapur", 8, 4,
            new QuoteRequest("Packaged food", 2000, false, stop, stop));
        commands.createOrFind(message);
        UUID assignment = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "request_context) VALUES (?, ?, ?, 'STOCHASTIC', 'RANKED', 'TEST', '{}')", assignment, order, order);
        RoutingResult routing = new RoutingResult(delivery.providerId(), delivery, new AssignmentResponse(assignment, order, order,
            AssignmentStrategy.STOCHASTIC, AssignmentStatus.RANKED, "TEST", null, delivery.providerId(), null, List.of(), Instant.now()),
            UUID.randomUUID(), List.of(), List.of());
        transaction.executeWithoutResult(status -> completion.complete(message, routing));
        return order;
    }

    private InvoiceInput invoice(String reference, String csv) {
        return new InvoiceInput("borzo", reference, today.minusDays(1), today, csv);
    }

    private Long expected(String booking) {
        return database.db.queryForObject("SELECT expected_paise FROM delivery_schema.courier_booking_charge WHERE provider_delivery_id = ?",
            Long.class, booking);
    }

    private int count(String table) {
        return database.db.queryForObject("SELECT count(*) FROM delivery_schema." + table, Integer.class);
    }

    private static ProviderDelivery delivery(String courier, String id, String payment, String deliveryFee) {
        return new ProviderDelivery(courier, id, null, DeliveryStatus.SEARCHING, "new", payment == null ? null : new BigDecimal(payment),
            deliveryFee == null ? null : new BigDecimal(deliveryFee), null, null, Instant.now());
    }
}
