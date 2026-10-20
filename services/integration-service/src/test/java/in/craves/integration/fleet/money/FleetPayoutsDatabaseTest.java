package in.craves.integration.fleet.money;

import static in.craves.integration.fleet.money.FleetEarningsDatabaseTest.refused;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.PayoutAccountInput;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.money.FleetMoneyModels.BatchInput;
import in.craves.integration.fleet.money.FleetMoneyModels.Payout;
import in.craves.integration.fleet.money.FleetMoneyModels.PayoutBatch;
import in.craves.integration.fleet.money.FleetMoneyModels.PayoutsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.RiderPayout;
import in.craves.integration.fleet.pay.FleetPay.Ending;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.bank.BankDataCipher;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Manual payouts (PLAN F13) against a real database: a weekly file from the database, a second approver, the bank file,
 * UTRs, and a reconciliation of ledger, file and UTRs for a test week; withdrawals, failures and debt recovery.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetPayoutsDatabaseTest {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final BankDataCipher cipher = new BankDataCipher(json, "k1", "{\"k1\":\"" + Base64.getEncoder().encodeToString(new byte[32]) + "\"}");
    final Admin maker = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
    final Admin checker = new Admin(UUID.randomUUID(), "Admin +91 97xxxxx111");
    // Files are made on or after their date, so the test weeks are the last five Mondays (monday.plusWeeks(4) is this week's).
    final LocalDate monday = LocalDate.now(IST).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(4);
    FleetAdminService admin;
    FleetEarnings earnings;
    FleetPayouts payouts;
    FleetTripPay pay;
    UUID ravi;
    UUID sita;

    @BeforeEach
    void setUp() {
        admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class), cipher);
        LedgerPostingService ledger = new LedgerPostingService(fleet.db, json, true);
        earnings = new FleetEarnings(fleet.db, json, ledger, admin, fleet.transactions, Runnable::run, false, "", 0, 0, true);
        payouts = new FleetPayouts(fleet.db, ledger, admin, earnings, cipher, FleetDatabase.properties(true), 500, true);
        pay = new FleetTripPay(fleet.db, new FleetPolicyStore(fleet.db, json), json,
            event -> earnings.onTripPayFinalized((FleetTripPayFinalized) event));
        ravi = fleet.rider("Ravi Kumar", "+919876543210");
        sita = fleet.rider("=Sita Devi", "+919876543211"); // a name a spreadsheet would read as a formula
    }

    /** One ₹67 trip (FleetEarningsDatabaseTest), delivered two days ago, so its pay is withdrawable now. */
    UUID earned(UUID rider) {
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'DELIVERED', rider_id = ?, rate_card_version = '2026-10-v1', "
            + "pickup_distance_m = 1800, drop_distance_m = 4200, picked_up_at = now(), finished_at = now() WHERE id = ?", rider, trip);
        pay.finalizePay(trip, Ending.DELIVERED, false, null);
        fleet.db.update("UPDATE fleet_schema.trip SET pay_finalized_at = now() - interval '2 days' WHERE id = ?", trip);
        fleet.db.update("UPDATE fleet_schema.rider_earning SET withdrawable_at = now() - interval '1 day' WHERE trip_id = ?", trip);
        return trip;
    }

    void bank(UUID rider, String holder) {
        admin.setPayoutAccount(maker, UUID.randomUUID(), rider, new PayoutAccountInput("BANK", null, "123456789012", "HDFC0001234", holder, true));
    }

    void upi(UUID rider, String upiId, String holder) {
        admin.setPayoutAccount(maker, UUID.randomUUID(), rider, new PayoutAccountInput("UPI", upiId, null, null, holder, true));
    }

    @Test
    void aTestWeekReconcilesLedgerBankFileAndUtrs() {
        bank(ravi, "Ravi Kumar");
        upi(sita, "-sita@okaxis", "=Sita Devi");
        earned(ravi);
        earned(ravi);
        earned(sita);
        payouts.withdraw(ravi, "rider-withdraw-1", 5000L); // in the next daily file, not the weekly one

        PayoutBatch weekly = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday)));
        assertThat(weekly.status()).isEqualTo("CREATED");
        assertThat(weekly.createdByMe()).isTrue();
        assertThat(weekly.payouts()).extracting(Payout::riderName, Payout::amountPaise, Payout::status)
            .containsExactlyInAnyOrder(org.assertj.core.groups.Tuple.tuple("Ravi Kumar", 13400L - 5000L, "PENDING"),
                org.assertj.core.groups.Tuple.tuple("=Sita Devi", 6700L, "PENDING"));
        assertThat(weekly.totalPaise()).isEqualTo(15100);

        // Maker-checker: the maker cannot approve; a second payments admin can, once.
        refused(() -> payouts.approve(maker, UUID.randomUUID(), weekly.batchId()), 403, "SAME_APPROVER");
        refused(() -> payouts.markSent(maker, UUID.randomUUID(), weekly.batchId()), 409, "BATCH_NOT_APPROVED");
        PayoutBatch approved = (PayoutBatch) payouts.approve(checker, UUID.randomUUID(), weekly.batchId());
        assertThat(approved.approvedBy()).isEqualTo(checker.name());
        assertThat(approved.createdByMe()).isFalse();
        refused(() -> payouts.approve(new Admin(UUID.randomUUID(), "Admin +91 96xxxxx222"), UUID.randomUUID(), weekly.batchId()), 409,
            "BATCH_NOT_CREATED");

        // The bank file: full numbers, rupees with paise, formula-looking cells neutralised, the download audited.
        String csv = new String(payouts.file(checker, weekly.batchId()).bytes(), StandardCharsets.UTF_8);
        List<String> lines = Arrays.asList(csv.split("\r\n"));
        assertThat(lines.get(0)).isEqualTo("payoutId,holderName,accountOrUpiId,ifsc,amountRupees");
        Map<String, String[]> file = new HashMap<>();
        lines.subList(1, lines.size()).forEach(line -> file.put(line.split(",")[0], line.split(",", -1)));
        Payout raviPayout = weekly.payouts().stream().filter(p -> p.riderId().equals(ravi)).findFirst().orElseThrow();
        Payout sitaPayout = weekly.payouts().stream().filter(p -> p.riderId().equals(sita)).findFirst().orElseThrow();
        assertThat(file.get(raviPayout.payoutId().toString())).containsExactly(raviPayout.payoutId().toString(), "Ravi Kumar", "123456789012",
            "HDFC0001234", "84.00");
        assertThat(file.get(sitaPayout.payoutId().toString())).containsExactly(sitaPayout.payoutId().toString(), "'=Sita Devi", "'-sita@okaxis",
            "", "67.00");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'PAYOUT_FILE_DOWNLOADED' AND target_id = ?",
            Integer.class, weekly.batchId().toString())).isEqualTo(1);
        assertThat(fleet.db.queryForObject("SELECT summary FROM fleet_schema.admin_audit WHERE action = 'PAYOUT_FILE_DOWNLOADED'", String.class))
            .doesNotContain("123456789012");

        refused(() -> tx(() -> payouts.markPaid(checker, UUID.randomUUID(), weekly.batchId(), raviPayout.payoutId(), "HDFCN52026102612345")), 409,
            "BATCH_NOT_SENT");
        payouts.markSent(maker, UUID.randomUUID(), weekly.batchId());
        Payout paid = (Payout) tx(() -> payouts.markPaid(checker, UUID.randomUUID(), weekly.batchId(), raviPayout.payoutId(), "hdfcn52026102612345"));
        assertThat(paid.status()).isEqualTo("PAID");
        assertThat(paid.utr()).isEqualTo("HDFCN52026102612345");
        refused(() -> tx(() -> payouts.markPaid(checker, UUID.randomUUID(), weekly.batchId(), sitaPayout.payoutId(), "HDFCN52026102612345")), 409,
            "UTR_IN_USE");
        refused(() -> tx(() -> payouts.markPaid(checker, UUID.randomUUID(), weekly.batchId(), raviPayout.payoutId(), "HDFCN52026102699999")), 409,
            "PAYOUT_NOT_PENDING");
        refused(() -> tx(() -> payouts.markPaid(checker, UUID.randomUUID(), weekly.batchId(), sitaPayout.payoutId(), "short")), 400, "VALIDATION_FAILED");
        assertThat(payouts.batch(checker, weekly.batchId()).status()).isEqualTo("SENT");
        tx(() -> payouts.markPaid(checker, UUID.randomUUID(), weekly.batchId(), sitaPayout.payoutId(), "ICICR52026102600042"));
        assertThat(payouts.batch(checker, weekly.batchId()).status()).as("closed once every payout is marked").isEqualTo("CLOSED");

        // Reconciliation: file total = payouts in the file = RIDER_PAYABLE paid out = BANK credited, and every UTR is on its file row.
        long fileTotal = file.values().stream().mapToLong(row -> new BigDecimal(row[4]).movePointRight(2).longValueExact()).sum();
        assertThat(fileTotal).isEqualTo(15100);
        assertThat(sum("SELECT sum(amount_paise) FROM fleet_schema.rider_payout_instruction WHERE batch_id = ? AND state = 'PAID'",
            weekly.batchId())).isEqualTo(15100);
        assertThat(fleet.db.queryForObject("SELECT sum(l.debit_amount) FROM payment_schema.ledger_line l JOIN payment_schema.ledger_transaction t "
            + "ON t.id = l.transaction_id WHERE t.event_type = 'RIDER_PAYOUT_PAID' AND l.account_code = 'RIDER_PAYABLE'", BigDecimal.class))
            .isEqualByComparingTo("151.00");
        assertThat(fleet.db.queryForObject("SELECT sum(l.credit_amount) FROM payment_schema.ledger_line l JOIN payment_schema.ledger_transaction t "
            + "ON t.id = l.transaction_id WHERE t.event_type = 'RIDER_PAYOUT_PAID' AND l.account_code = 'BANK'", BigDecimal.class))
            .isEqualByComparingTo("151.00");
        for (Map<String, Object> row : fleet.db.queryForList("SELECT i.id, i.utr, t.evidence_reference FROM fleet_schema.rider_payout_instruction i "
            + "JOIN payment_schema.ledger_transaction t ON t.business_event_key = 'fleet-payout/' || i.id || '/paid' WHERE i.batch_id = ?",
            weekly.batchId())) {
            assertThat(file).containsKey(row.get("id").toString());
            assertThat(row.get("evidence_reference")).isEqualTo("utr/" + row.get("utr"));
        }
        // The pooled account equals what riders earned less what reached their banks.
        assertThat(fleet.db.queryForObject("SELECT sum(credit_amount) - sum(debit_amount) FROM payment_schema.ledger_line "
            + "WHERE account_code = 'RIDER_PAYABLE'", BigDecimal.class).movePointRight(2).longValueExact())
            .isEqualTo(sum("SELECT sum(net_paise) FROM fleet_schema.rider_earning") - sum("SELECT sum(amount_paise) FROM "
                + "fleet_schema.rider_payout_instruction WHERE state = 'PAID'"));
        assertThat(payouts.payouts(ravi).withdrawablePaise()).isZero();
        assertThat(payouts.payouts(sita).withdrawablePaise()).isZero();
    }

    @Test
    void oneFreeWithdrawalADayUpToTheBalanceInTheNextDailyFile() {
        earned(ravi);
        refused(() -> payouts.withdraw(ravi, "k1", 1000L), 409, "PAYOUT_ACCOUNT_REQUIRED");
        bank(ravi, "Ravi Kumar");
        refused(() -> payouts.withdraw(ravi, "k1", 6701L), 409, "AMOUNT_OVER_BALANCE");
        refused(() -> payouts.withdraw(ravi, "k1", 0L), 400, "VALIDATION_FAILED");
        payouts.withdraw(ravi, "k1", 6000L);
        payouts.withdraw(ravi, "k1", 6000L); // the app's retry
        refused(() -> payouts.withdraw(ravi, "k1", 500L), 409, "IDEMPOTENCY_KEY_REUSED");
        refused(() -> payouts.withdraw(ravi, "k2", 500L), 409, "WITHDRAWAL_LIMIT");
        assertThat(sum("SELECT count(*) FROM fleet_schema.rider_payout_instruction WHERE rider_id = ?", ravi)).isEqualTo(1);

        PayoutsPage page = payouts.payouts(ravi);
        assertThat(page.withdrawablePaise()).isEqualTo(700);
        assertThat(page.nextPayoutOn().getDayOfWeek()).isEqualTo(DayOfWeek.MONDAY);
        RiderPayout requested = page.payouts().get(0);
        assertThat(requested.status()).isEqualTo("SCHEDULED");
        assertThat(requested.amountPaise()).isEqualTo(6000);
        assertThat(requested.periodLabel()).startsWith("Withdrawal, paid by 1 pm on ");

        LocalDate today = LocalDate.now(IST);
        refused(() -> tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("DAILY_WITHDRAWAL", today))), 422,
            "NOTHING_TO_PAY"); // today's requests are paid tomorrow
        // Tomorrow's file waits for tomorrow, so a request made later today still goes in it.
        refused(() -> tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("DAILY_WITHDRAWAL", today.plusDays(1)))), 422,
            "PAYOUT_DATE_IN_FUTURE");
        refused(() -> tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusWeeks(5)))), 422,
            "PAYOUT_DATE_IN_FUTURE");
        fleet.db.update("UPDATE fleet_schema.rider_payout_instruction SET payout_date = ? WHERE rider_id = ?", today, ravi); // as if asked yesterday
        PayoutBatch daily = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("DAILY_WITHDRAWAL", today)));
        assertThat(daily.payouts()).extracting(Payout::payoutId).containsExactly(UUID.fromString(requested.payoutId()));
        refused(() -> tx(() -> payouts.createBatch(checker, UUID.randomUUID(), new BatchInput("DAILY_WITHDRAWAL", today))), 409, "BATCH_EXISTS");
        payouts.approve(checker, UUID.randomUUID(), daily.batchId());
        payouts.markSent(checker, UUID.randomUUID(), daily.batchId());
        assertThat(payouts.payouts(ravi).payouts().get(0).status()).isEqualTo("PROCESSING");
        tx(() -> payouts.markPaid(checker, UUID.randomUUID(), daily.batchId(), daily.payouts().get(0).payoutId(), "HDFCN52026102100001"));
        RiderPayout done = payouts.payouts(ravi).payouts().get(0);
        assertThat(done.status()).isEqualTo("PAID");
        assertThat(done.utr()).isEqualTo("HDFCN52026102100001");
        assertThat(done.paidAt()).isNotNull();

        refused(() -> tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusDays(1)))), 422, "NOT_A_MONDAY");
        refused(() -> tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("MONTHLY", monday))), 400, "VALIDATION_FAILED");
    }

    @Test
    void aFailedPayoutKeepsTheMoneyAndPausesPayoutsUntilANewAccountIsSet() {
        bank(ravi, "Ravi Kumar");
        earned(ravi);
        PayoutBatch weekly = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday)));
        payouts.approve(checker, UUID.randomUUID(), weekly.batchId());
        payouts.markSent(checker, UUID.randomUUID(), weekly.batchId());
        assertThat(payouts.payouts(ravi).withdrawablePaise()).as("processing: not paid again").isZero();
        UUID payout = weekly.payouts().get(0).payoutId();
        Payout failed = (Payout) payouts.markFailed(checker, UUID.randomUUID(), weekly.batchId(), payout, "Bank says the account is closed");
        assertThat(failed.status()).isEqualTo("FAILED");
        assertThat(failed.failureReason()).isEqualTo("Bank says the account is closed");
        assertThat(payouts.batch(checker, weekly.batchId()).status()).isEqualTo("CLOSED");
        refused(() -> tx(() -> payouts.markPaid(checker, UUID.randomUUID(), weekly.batchId(), payout, "HDFCN52026102600001")), 409, "PAYOUT_NOT_PENDING");

        assertThat(payouts.payouts(ravi).withdrawablePaise()).as("the money is back in the balance").isEqualTo(6700);
        refused(() -> payouts.withdraw(ravi, "k1", 100L), 409, "PAYOUTS_PAUSED");
        refused(() -> tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusWeeks(1)))), 422, "NOTHING_TO_PAY");
        assertThat(sum("SELECT count(*) FROM payment_schema.ledger_transaction WHERE event_type = 'RIDER_PAYOUT_PAID'")).isZero();

        upi(ravi, "ravi@okaxis", "Ravi Kumar"); // ops verifies a new account in person
        PayoutBatch next = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusWeeks(1))));
        assertThat(next.payouts()).extracting(Payout::amountPaise, Payout::maskedAccount).containsExactly(
            org.assertj.core.groups.Tuple.tuple(6700L, "ra****@okaxis"));
    }

    @Test
    void debtIsRecoveredOnlyFromFuturePayAtTheWeeklyCap() {
        bank(ravi, "Ravi Kumar");
        UUID trip = earned(ravi);
        PayoutBatch first = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday)));
        payouts.approve(checker, UUID.randomUUID(), first.batchId());
        payouts.markSent(checker, UUID.randomUUID(), first.batchId());
        tx(() -> payouts.markPaid(checker, UUID.randomUUID(), first.batchId(), first.payouts().get(0).payoutId(), "HDFCN52026102600001"));

        // ₹12 overpaid, found after the payout: the rider owes it, but nothing is taken from their bank.
        tx(() -> {
            earnings.adjustTrip(maker, trip, "drop-km", -1200, "The drop was 2.9 km, not 4.2 km");
            return null;
        });
        assertThat(payouts.payouts(ravi).withdrawablePaise()).isZero();
        refused(() -> tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusWeeks(1)))), 422, "NOTHING_TO_PAY");

        earned(ravi); // ₹67 more: this week ₹5 (the cap) goes to the debt
        assertThat(payouts.payouts(ravi).withdrawablePaise()).isEqualTo(6200);
        PayoutBatch second = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusWeeks(2))));
        assertThat(second.payouts()).extracting(Payout::amountPaise).containsExactly(6200L);
        assertThat(sum("SELECT sum(amount_paise) FROM fleet_schema.rider_recovery WHERE rider_id = ?", ravi)).isEqualTo(500);
        assertThat(sum("SELECT count(*) FROM fleet_schema.rider_payout_instruction WHERE amount_paise <= 0")).isZero();

        earned(ravi);
        PayoutBatch third = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusWeeks(3))));
        assertThat(third.payouts()).extracting(Payout::amountPaise).containsExactly(6200L);
        earned(ravi);
        PayoutBatch fourth = (PayoutBatch) tx(() -> payouts.createBatch(maker, UUID.randomUUID(), new BatchInput("WEEKLY", monday.plusWeeks(4))));
        assertThat(fourth.payouts()).as("only the last ₹2 of debt").extracting(Payout::amountPaise).containsExactly(6500L);
        assertThat(sum("SELECT sum(amount_paise) FROM fleet_schema.rider_recovery WHERE rider_id = ?", ravi)).isEqualTo(1200);
        assertThat(payouts.balance(ravi).outstanding()).isZero();
    }

    /** Service calls that post to the journal run in a transaction, as Spring runs them; the journal checks its balance at commit. */
    <T> T tx(Supplier<T> call) {
        return new TransactionTemplate(fleet.transactions).execute(status -> call.get());
    }

    long sum(String sql, Object... args) {
        return fleet.db.queryForObject(sql, Long.class, args);
    }
}
