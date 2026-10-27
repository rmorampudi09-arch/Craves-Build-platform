package in.craves.integration.fleet.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.money.FleetMoneyModels.Adjustment;
import in.craves.integration.fleet.money.FleetMoneyModels.AdjustmentInput;
import in.craves.integration.fleet.money.FleetMoneyModels.EarningsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.Hold;
import in.craves.integration.fleet.money.FleetMoneyModels.HoldInput;
import in.craves.integration.fleet.money.FleetMoneyModels.TripEarning;
import in.craves.integration.fleet.pay.FleetPay.Ending;
import in.craves.integration.fleet.rider.FleetRiderModels.HomeSummary;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderMe;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripPayFinalized;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The earnings ledger (PLAN F12) against a real database: one credit per trip, pending for 24 h, holds on the flagged
 * trip only, TDS as its own line, slot top-ups, adjustments as revisions, and journals that net to zero per trip.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetEarningsDatabaseTest {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final String PHOTO_HOLD = "Delivered with a photo. Ops checks the photo before this pay is released.";
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
    FleetAdminService admin;
    FleetEarnings earnings;
    FleetTripPay pay;
    UUID rider;

    @BeforeEach
    void setUp() {
        admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class), mock(BankDataCipher.class));
        earnings = earnings(false, true);
        // The trip code publishes FleetTripPayFinalized; here it reaches the listener directly, and the credit runs at once.
        pay = new FleetTripPay(fleet.db, new FleetPolicyStore(fleet.db, json), json,
            event -> earnings.onTripPayFinalized((FleetTripPayFinalized) event));
        rider = fleet.rider("Ravi Kumar", "+919876543210");
    }

    /** TDS: 1% once the year passes ₹100. */
    FleetEarnings earnings(boolean tds, boolean ledgerOn) {
        return new FleetEarnings(fleet.db, json, new LedgerPostingService(fleet.db, json, ledgerOn), admin, fleet.transactions, Runnable::run, tds,
            "393(1) Table Sl. 6(i)", 100, 10_000, ledgerOn);
    }

    /** Draft rate card 2026-10-v1, drop 4.2 km, pickup 1.8 km, no wait: ₹40 base + ₹19.80 drop + ₹7.20 pickup = ₹67. */
    UUID deliveredTrip(boolean held) {
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'DELIVERED', rider_id = ?, rate_card_version = '2026-10-v1', "
            + "pickup_distance_m = 1800, drop_distance_m = 4200, picked_up_at = now() - interval '20 minutes', finished_at = now() "
            + "WHERE id = ?", rider, trip);
        pay.finalizePay(trip, Ending.DELIVERED, held, held ? PHOTO_HOLD : null);
        return trip;
    }

    @Test
    void aDeliveredTripIsCreditedOncePendingForADayAndItsJournalsNetToZero() {
        UUID trip = deliveredTrip(false);
        assertThat(fleet.db.queryForList("SELECT component, revision, net_paise, label FROM fleet_schema.rider_earning WHERE trip_id = ? "
            + "ORDER BY net_paise DESC", trip)).extracting(row -> row.get("component"), row -> row.get("revision"), row -> row.get("net_paise"),
            row -> row.get("label"))
            .containsExactly(tuple("base", 1, 4000L, "Base pay"), tuple("drop-km", 1, 1980L, "Drop distance"),
                tuple("pickup-km", 1, 720L, "Ride to the kitchen"));
        assertThat(fleet.db.queryForObject("SELECT bool_and(e.withdrawable_at = t.pay_finalized_at + interval '24 hours') "
            + "FROM fleet_schema.rider_earning e JOIN fleet_schema.trip t ON t.id = e.trip_id WHERE e.trip_id = ?", Boolean.class, trip))
            .as("pending until 24 h after the delivery").isTrue();

        // The event again, a direct credit and the money job credit nothing more.
        earnings.onTripPayFinalized(new FleetTripPayFinalized(trip, rider, "2026-10-v1", List.of(), false, null, Instant.now()));
        assertThat(earnings.creditTrip(trip)).isFalse();
        earnings.tick();
        assertThat(count("SELECT count(*) FROM fleet_schema.rider_earning WHERE trip_id = ?", trip)).isEqualTo(3);
        assertThat(count("SELECT count(*) FROM payment_schema.ledger_transaction WHERE business_event_key LIKE ?", "fleet-trip-pay/" + trip + "/%"))
            .isEqualTo(3);
        // The business key alone refuses a second credit.
        assertThatThrownBy(() -> fleet.db.update("INSERT INTO fleet_schema.rider_earning (id, rider_id, trip_id, component, revision, "
            + "business_key, gross_paise, net_paise, rate_card_version, withdrawable_at) VALUES (?, ?, ?, 'base', 1, ?, 4000, 4000, "
            + "'2026-10-v1', now())", UUID.randomUUID(), rider, trip, "fleet-trip-pay/" + trip + "/base/1"))
            .isInstanceOf(DuplicateKeyException.class);

        assertThat(tripNet(trip)).as("debits equal credits for the trip").isEqualByComparingTo("0.00");
        assertThat(payable(trip)).as("RIDER_PAYABLE owes the rider ₹67").isEqualByComparingTo("67.00");
        assertThat(fleet.db.queryForObject("SELECT sum(debit_amount) FROM payment_schema.ledger_line WHERE delivery_attempt_id = ? "
            + "AND account_code = 'DELIVERY_EXPENSE' AND provider_id = 'craves_fleet'", BigDecimal.class, trip)).isEqualByComparingTo("67.00");

        TripEarning earning = earnings.tripEarning(rider, trip);
        assertThat(earning.status()).isEqualTo("CREDITED");
        assertThat(earning.holdReason()).isNull();
        assertThat(earning.amountPaise()).isEqualTo(6700);
        assertThat(earning.lines()).extracting(FleetMoneyModels.Line::label)
            .containsExactly("Base pay", "Drop distance", "Ride to the kitchen");
        assertThat(earning.rateCardVersion()).isEqualTo("2026-10-v1");
        assertThat(earning.dropDistanceM()).isEqualTo(4200);
        refused(() -> earnings.tripEarning(fleet.rider("Sita Devi", "+919876543211"), trip), 404, "TRIP_NOT_FOUND");
    }

    @Test
    void aPhotoDeliveryHoldsThatTripOnlyUntilOpsReleasesIt() {
        UUID photo = deliveredTrip(true);
        UUID otp = deliveredTrip(false);
        List<Hold> holds = earnings.holds("ACTIVE").holds();
        assertThat(holds).hasSize(1);
        Hold hold = holds.get(0);
        assertThat(hold.tripId()).isEqualTo(photo);
        assertThat(hold.reason()).isEqualTo(PHOTO_HOLD);
        assertThat(hold.createdBy()).isEqualTo(FleetEarnings.AUTOMATIC);
        assertThat(hold.releaseOn()).as("at most 7 days").isEqualTo(LocalDate.now(IST).plusDays(7));
        assertThat(hold.amountPaise()).isEqualTo(6700);
        assertThat(hold.orderCode()).isEqualTo("#0A1B2C3D");

        TripEarning held = earnings.tripEarning(rider, photo);
        assertThat(held.status()).isEqualTo("HELD");
        assertThat(held.holdReason()).isEqualTo(PHOTO_HOLD);
        assertThat(held.releaseOn()).isEqualTo(LocalDate.now(IST).plusDays(7).atStartOfDay(IST).toInstant());
        assertThat(earnings.tripEarning(rider, otp).status()).as("the rider's other pay is untouched").isEqualTo("CREDITED");

        refused(() -> earnings.placeHold(ops, UUID.randomUUID(), new HoldInput(photo, "Customer says not delivered",
            LocalDate.now(IST).plusDays(2))), 409, "HOLD_EXISTS");
        Hold released = (Hold) earnings.releaseHold(ops, UUID.randomUUID(), hold.holdId());
        assertThat(released.state()).isEqualTo("RELEASED");
        assertThat(released.releasedBy()).isEqualTo(ops.name());
        refused(() -> earnings.releaseHold(ops, UUID.randomUUID(), hold.holdId()), 409, "HOLD_NOT_ACTIVE");
        refused(() -> earnings.releaseHold(ops, UUID.randomUUID(), UUID.randomUUID()), 404, "HOLD_NOT_FOUND");
        assertThat(earnings.tripEarning(rider, photo).status()).isEqualTo("CREDITED");
        refused(() -> earnings.placeHold(ops, UUID.randomUUID(), new HoldInput(photo, "Again", LocalDate.now(IST))), 409, "HOLD_EXISTS");
    }

    @Test
    void opsHoldsOneTripUpToSevenDaysOnceAndTheJobReleasesItOnItsDate() {
        UUID trip = deliveredTrip(false);
        LocalDate today = LocalDate.now(IST);
        refused(() -> earnings.placeHold(ops, UUID.randomUUID(), new HoldInput(trip, "Customer says not delivered", today.plusDays(8))),
            422, "RELEASE_DATE_OUT_OF_RANGE");
        refused(() -> earnings.placeHold(ops, UUID.randomUUID(), new HoldInput(trip, "Customer says not delivered", today.minusDays(1))),
            422, "RELEASE_DATE_OUT_OF_RANGE");
        refused(() -> earnings.placeHold(ops, UUID.randomUUID(), new HoldInput(UUID.randomUUID(), "Customer says not delivered", today)),
            404, "TRIP_NOT_FOUND");
        refused(() -> earnings.placeHold(ops, UUID.randomUUID(), new HoldInput(trip, "no", today)), 400, "VALIDATION_FAILED");

        UUID key = UUID.randomUUID();
        HoldInput input = new HoldInput(trip, "Customer says not delivered", today);
        Hold hold = (Hold) earnings.placeHold(ops, key, input);
        assertThat(((JsonNode) earnings.placeHold(ops, key, input)).path("holdId").asText()).as("a replay returns the first hold")
            .isEqualTo(hold.holdId().toString());
        assertThat(count("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'PAY_HOLD_PLACED' AND target_id = ?",
            hold.holdId().toString())).isEqualTo(1);
        assertThat(earnings.tripEarning(rider, trip).status()).isEqualTo("HELD");

        earnings.tick(); // release_on is today
        Hold released = earnings.holds("RELEASED").holds().get(0);
        assertThat(released.holdId()).isEqualTo(hold.holdId());
        assertThat(released.releasedBy()).as("released automatically").isNull();
        assertThat(released.releasedAt()).isNotNull();
        assertThat(earnings.tripEarning(rider, trip).status()).isEqualTo("CREDITED");
    }

    @Test
    void payThatWasWithdrawableWhenTheRiderWasPaidCannotBeHeld() {
        UUID trip = deliveredTrip(false);
        fleet.db.update("UPDATE fleet_schema.trip SET pay_finalized_at = now() - interval '2 days' WHERE id = ?", trip);
        fleet.db.update("INSERT INTO fleet_schema.rider_payout_instruction (id, rider_id, kind, payout_date, amount_paise, payout_account_id, "
            + "created_at) VALUES (?, ?, 'DAILY_WITHDRAWAL', current_date, 6700, ?, now() - interval '12 hours')", UUID.randomUUID(), rider,
            payoutAccount(rider));
        refused(() -> earnings.placeHold(ops, UUID.randomUUID(), new HoldInput(trip, "Customer says not delivered", LocalDate.now(IST))),
            409, "EARNING_ALREADY_PAID");
    }

    @Test
    void tdsIsItsOwnLineAgainstTheYearToDateAndEveryTripStillNetsToZero() {
        earnings = earnings(true, true);
        UUID first = deliveredTrip(false);  // year ₹67: under ₹100, nothing withheld
        UUID second = deliveredTrip(false); // year ₹134: 1% of the year, ₹1.34
        UUID third = deliveredTrip(false);  // year ₹201: ₹2.01 due, ₹0.67 more
        assertThat(tds(first)).isZero();
        assertThat(tds(second)).isEqualTo(134);
        assertThat(tds(third)).isEqualTo(67);
        TripEarning earning = earnings.tripEarning(rider, second);
        assertThat(earning.amountPaise()).isEqualTo(6700 - 134);
        assertThat(earning.lines()).last().isEqualTo(new FleetMoneyModels.Line("TDS (section 393(1) Table Sl. 6(i), 1%)", -134));
        for (UUID trip : List.of(first, second, third)) {
            assertThat(tripNet(trip)).isEqualByComparingTo("0.00");
        }
        assertThat(fleet.db.queryForObject("SELECT sum(credit_amount) - sum(debit_amount) FROM payment_schema.ledger_line "
            + "WHERE account_code = 'RIDER_TDS_PAYABLE'", BigDecimal.class)).isEqualByComparingTo("2.01");
        assertThat(payable(second)).isEqualByComparingTo("65.66");
    }

    @Test
    void aSlotTopUpIsCreditedOnceAsItsOwnComponentAndAZeroTopUpIsOnlyMarked() {
        UUID slot = settledSlot(9300);
        UUID covered = settledSlot(0);
        earnings.tick();
        assertThat(fleet.db.queryForList("SELECT business_key, component, net_paise, label FROM fleet_schema.rider_earning WHERE slot_id = ?",
            slot)).extracting(row -> row.get("business_key"), row -> row.get("component"), row -> row.get("net_paise"), row -> row.get("label"))
            .containsExactly(tuple("fleet-slot-pay/" + slot + "/slot-top-up/1", "slot-top-up", 9300L, "Slot guarantee top-up"));
        assertThat(count("SELECT count(*) FROM fleet_schema.rider_slot_settlement WHERE credited_at IS NOT NULL")).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM fleet_schema.rider_earning WHERE slot_id = ?", covered)).isZero();
        assertThat(fleet.db.queryForObject("SELECT sum(credit_amount) FROM payment_schema.ledger_line l JOIN payment_schema.ledger_transaction t "
            + "ON t.id = l.transaction_id WHERE t.event_type = 'RIDER_SLOT_TOP_UP' AND l.account_code = 'RIDER_PAYABLE'", BigDecimal.class))
            .isEqualByComparingTo("93.00");
        assertThat(earnings.creditSlot(slot)).isFalse();
        assertThat(earnings.earnings(rider, "today", null).totalPaise()).as("in today's total, not a trip").isEqualTo(9300);
        assertThat(earnings.earnings(rider, "today", null).trips()).isEmpty();
    }

    @Test
    void anAdjustmentIsTheNextRevisionWithItsReasonAndCanTakePayBack() {
        UUID trip = deliveredTrip(false);
        UUID key = UUID.randomUUID();
        AdjustmentInput input = new AdjustmentInput("drop-km", -500L, "The drop was 3.6 km, not 4.2 km");
        Adjustment adjustment = (Adjustment) tx(() -> earnings.adjustTrip(ops, key, trip, input));
        assertThat(adjustment.revision()).isEqualTo(2);
        assertThat(adjustment.amountPaise()).isEqualTo(-500);
        assertThat(adjustment.riderId()).isEqualTo(rider);
        assertThat(fleet.db.queryForMap("SELECT business_key, net_paise, reason FROM fleet_schema.rider_earning WHERE trip_id = ? "
            + "AND revision = 2", trip)).containsEntry("business_key", "fleet-trip-pay/" + trip + "/drop-km/2")
            .containsEntry("net_paise", -500L).containsEntry("reason", "The drop was 3.6 km, not 4.2 km");
        TripEarning earning = earnings.tripEarning(rider, trip);
        assertThat(earning.status()).isEqualTo("ADJUSTED");
        assertThat(earning.amountPaise()).isEqualTo(6200);
        assertThat(earning.lines()).last().isEqualTo(new FleetMoneyModels.Line("Adjustment: The drop was 3.6 km, not 4.2 km", -500));
        assertThat(tripNet(trip)).isEqualByComparingTo("0.00");
        assertThat(payable(trip)).isEqualByComparingTo("62.00");
        assertThat(fleet.db.queryForMap("SELECT event_type, actor_type FROM payment_schema.ledger_transaction WHERE business_event_key = ?",
            "fleet-trip-pay/" + trip + "/drop-km/2")).containsEntry("event_type", "RIDER_PAY_ADJUSTED").containsEntry("actor_type", "HUMAN");
        assertThat(count("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'PAY_ADJUSTED'")).isEqualTo(1);
        // The same key again is the first answer, never a second correction.
        JsonNode replay = json.valueToTree(tx(() -> earnings.adjustTrip(ops, key, trip, input)));
        assertThat(replay.get("revision").asInt()).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM fleet_schema.rider_earning WHERE trip_id = ? AND component = 'drop-km'", trip)).isEqualTo(2);

        refused(() -> tx(() -> earnings.adjustTrip(ops, UUID.randomUUID(), trip, new AdjustmentInput("tds", 100L, "Wrong tax"))), 400,
            "VALIDATION_FAILED");
        refused(() -> tx(() -> earnings.adjustTrip(ops, UUID.randomUUID(), trip, new AdjustmentInput("base", 0L, "Nothing"))), 400,
            "VALIDATION_FAILED");
        refused(() -> tx(() -> earnings.adjustTrip(ops, UUID.randomUUID(), trip, new AdjustmentInput("base", 1_000_001L, "A typo"))), 400,
            "VALIDATION_FAILED");
        refused(() -> tx(() -> earnings.adjustTrip(ops, UUID.randomUUID(), UUID.randomUUID(), new AdjustmentInput("base", 100L,
            "Missing base"))), 404, "TRIP_NOT_FOUND");
        UUID waiting = deliveredTrip(false);
        fleet.db.update("UPDATE fleet_schema.trip SET pay_credited_at = NULL WHERE id = ?", waiting);
        refused(() -> tx(() -> earnings.adjustTrip(ops, UUID.randomUUID(), waiting, new AdjustmentInput("base", 100L, "Missed base"))),
            409, "TRIP_NOT_CREDITED");
    }

    @Test
    void anIssueRaisedBeforeThePayIsWithdrawableHoldsThatTripUntilFixed() {
        UUID trip = deliveredTrip(false);
        fleet.db.update("INSERT INTO fleet_schema.support_issue (id, rider_id, trip_id, category, acknowledge_by, fix_by) "
            + "VALUES (?, ?, ?, 'WRONG_DISTANCE', now() + interval '24 hours', now() + interval '72 hours')", UUID.randomUUID(), rider, trip);
        TripEarning disputed = earnings.tripEarning(rider, trip);
        assertThat(disputed.status()).isEqualTo("HELD");
        assertThat(disputed.holdReason()).isEqualTo(FleetEarnings.DISPUTE_REASON);
        assertThat(Duration.between(Instant.now(), disputed.releaseOn())).isBetween(Duration.ofDays(7).minusMinutes(1), Duration.ofDays(7));
        fleet.db.update("UPDATE fleet_schema.support_issue SET state = 'FIXED', fixed_at = now() WHERE trip_id = ?", trip);
        assertThat(earnings.tripEarning(rider, trip).status()).isEqualTo("CREDITED");
    }

    @Test
    void withTheJournalOffTheDeliveryStandsAndTheJobCreditsItOnceTheJournalIsOn() {
        earnings = earnings(false, false);
        UUID trip = deliveredTrip(false);
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE id = ?", String.class, trip)).isEqualTo("DELIVERED");
        assertThat(count("SELECT count(*) FROM fleet_schema.rider_earning WHERE trip_id = ?", trip)).isZero();
        earnings.tick();
        assertThat(count("SELECT count(*) FROM fleet_schema.rider_earning WHERE trip_id = ?", trip)).isZero();
        earnings = earnings(false, true);
        earnings.tick();
        assertThat(count("SELECT count(*) FROM fleet_schema.rider_earning WHERE trip_id = ?", trip)).isEqualTo(3);
    }

    @Test
    void earningsComeTwentyTripsAPageNewestFirstWithTheWholeRangesTotal() {
        List<UUID> trips = new ArrayList<>();
        for (int i = 0; i < 23; i++) {
            trips.add(deliveredTrip(false));
        }
        EarningsPage first = earnings.earnings(rider, "today", null);
        assertThat(first.rangeLabel()).isEqualTo("Today");
        assertThat(first.trips()).hasSize(20);
        assertThat(first.totalPaise()).isEqualTo(23 * 6700);
        assertThat(first.nextCursor()).isNotNull();
        EarningsPage second = earnings.earnings(rider, "today", first.nextCursor());
        assertThat(second.trips()).hasSize(3);
        assertThat(second.nextCursor()).isNull();
        Set<String> seen = new HashSet<>();
        first.trips().forEach(trip -> seen.add(trip.tripId()));
        second.trips().forEach(trip -> seen.add(trip.tripId()));
        assertThat(seen).hasSize(23);
        assertThat(first.trips().get(0).completedAt()).isAfterOrEqualTo(first.trips().get(19).completedAt());
        assertThat(earnings.earnings(rider, "week", null).totalPaise()).isEqualTo(23 * 6700);
        refused(() -> earnings.earnings(rider, "today", "not-a-cursor"), 400, "VALIDATION_FAILED");
    }

    @Test
    void meShowsPayoutsOnceAnAccountIsVerifiedAndHomeShowsTodaysPay() {
        UUID identity = UUID.randomUUID();
        fleet.db.update("UPDATE fleet_schema.rider SET identity_id = ?, status = 'ACTIVE' WHERE id = ?", identity, rider);
        FleetRiderService riders = new FleetRiderService(fleet.db, new FleetPolicyStore(fleet.db, json), FleetDatabase.properties(true),
            mock(FleetStorage.class));
        CravesPrincipal principal = new CravesPrincipal(identity, "+919876543210", Set.of("RIDER"));
        RiderMe before = riders.me(principal);
        assertThat(before.features().payoutsEnabled()).isFalse();
        assertThat(before.features().withdrawEnabled()).isFalse();
        assertThat(before.features().nativeTripOutbox()).as("trip steps don't take the shift credential").isFalse();
        payoutAccount(rider);
        assertThat(riders.me(principal).features().payoutsEnabled()).isTrue();
        assertThat(riders.me(principal).features().withdrawEnabled()).isTrue();

        deliveredTrip(false);
        deliveredTrip(true);
        HomeSummary home = riders.home(identity);
        assertThat(home.todayEarningsPaise()).isEqualTo(2 * 6700);
        assertThat(home.todayTrips()).isEqualTo(2);
        assertThat(riders.riderId(identity)).isEqualTo(rider);
    }

    UUID settledSlot(long topUpPaise) {
        UUID slot = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, guaranteed_per_hour_paise, status) "
            + "VALUES (?, ?, 'Madhapur', now() - interval '2 hours', now() - interval '1 minute', 8000, 'COMPLETED')", slot, rider);
        fleet.db.update("INSERT INTO fleet_schema.rider_slot_settlement (slot_id, rider_id, guaranteed_per_hour_paise, online_in_zone_seconds, "
            + "guaranteed_paise, trip_pay_paise, top_up_paise) VALUES (?, ?, 8000, 7200, 16000, ?, ?)", slot, rider, 16000 - topUpPaise, topUpPaise);
        return slot;
    }

    UUID payoutAccount(UUID riderId) {
        UUID id = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider_payout_account (id, rider_id, method, encrypted_details, fingerprint, masked_account, "
            + "holder_name, verified_in_person, set_by, set_by_name) VALUES (?, ?, 'UPI', 'sealed', ?, 'ra****@okaxis', 'Ravi Kumar', true, ?, "
            + "'Admin')", id, riderId, "fp-" + id, UUID.randomUUID());
        return id;
    }

    long tds(UUID trip) {
        return fleet.db.queryForObject("SELECT COALESCE(sum(withheld_paise), 0) FROM fleet_schema.rider_earning WHERE trip_id = ? "
            + "AND component = 'tds'", Long.class, trip);
    }

    BigDecimal tripNet(UUID trip) {
        return fleet.db.queryForObject("SELECT sum(debit_amount) - sum(credit_amount) FROM payment_schema.ledger_line WHERE delivery_attempt_id = ?",
            BigDecimal.class, trip);
    }

    BigDecimal payable(UUID trip) {
        return fleet.db.queryForObject("SELECT sum(credit_amount) - sum(debit_amount) FROM payment_schema.ledger_line "
            + "WHERE delivery_attempt_id = ? AND account_code = 'RIDER_PAYABLE'", BigDecimal.class, trip);
    }

    /** Service calls run in a transaction, as Spring runs them; the journal checks its balance at commit. */
    void tx(Runnable call) {
        tx(() -> {
            call.run();
            return null;
        });
    }

    <T> T tx(Supplier<T> call) {
        return new TransactionTemplate(fleet.transactions).execute(status -> call.get());
    }

    int count(String sql, Object... args) {
        return fleet.db.queryForObject(sql, Integer.class, args);
    }

    static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
