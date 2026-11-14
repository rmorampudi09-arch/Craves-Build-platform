package in.craves.integration.finance.source;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.insights.FinanceInsightsService;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.ChefPayoutService;
import in.craves.integration.payout.ManualChefSettlementService;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

/** The admin Finance reads against the real schema, with money created by the real quote, delivery and payout services. */
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinanceInsightsDatabaseTest {
    OrderFinancialFinalizationDatabaseTest f;
    FinanceInsightsService insights;
    final CravesPrincipal reader = new CravesPrincipal(UUID.randomUUID(), "", Set.of("AUDIT_ADMIN"));
    final LocalDate today = LocalDate.now(FinancePolicy.ZONE);

    @BeforeEach void setup() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        // The shared fixture rebuilds payment_schema only; rider rows of an earlier test would otherwise leak into the totals.
        new JdbcTemplate(new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD")))
            .execute("DROP SCHEMA IF EXISTS fleet_schema CASCADE");
        f = new OrderFinancialFinalizationDatabaseTest(); f.setup();
        var manual = new ManualChefSettlementService(f.jdbc, f.json, f.policies, new LedgerPostingService(f.jdbc, f.json, true), false);
        insights = new FinanceInsightsService(f.jdbc, manual, true);
    }

    CravesPrincipal chef() { return new CravesPrincipal(f.chef, "", Set.of("CHEF")); }
    UUID deliver() { UUID payment = f.payment(f.quote.total(), "PAID", f.customer); assertEquals("POSTED", f.accept(f.event(f.snapshot, "DELIVERED")).result()); return payment; }
    void releaseBank() {
        f.tx.execute(s -> { f.payouts.bindVerifiedBeneficiary(f.admin, f.chef, new ChefPayoutService.Binding("fa_test", "cont_test", "TEST_BANK_OWNERSHIP", "Test review"));
            f.payouts.hold(f.admin, f.chef, new ChefPayoutService.Hold(false, "Test reviewed release")); return null; });
    }
    UUID payChef() {
        UUID payout = f.tx.execute(s -> f.payouts.withdraw(chef(), new ChefPayoutService.Withdrawal(UUID.randomUUID(), "338.52"))).id();
        var work = f.tx.execute(s -> f.payouts.claim());
        f.tx.execute(s -> { f.payouts.recordOutcome(work, new RazorpayXPayoutClient.Receipt("pout_test", "processed", "UTR2026TEST01")); return null; });
        return payout;
    }
    FinanceInsightsService.MovementPage list(String kind, String search, String cursor, int limit) {
        return insights.movements(reader, today.minusDays(1), today, kind, null, null, search, cursor, limit);
    }
    static void assertStatus(int expected, Runnable call) {
        assertEquals(expected, assertThrows(ResponseStatusException.class, call::run).getStatusCode().value());
    }

    @Test void aDeliveredOrderIsFollowedFromTheCustomerPaymentToTheChefsBank() {
        UUID payment = deliver(); releaseBank(); UUID payout = payChef();

        var overview = insights.overview(reader, today.minusDays(6), today);
        assertEquals(7, overview.days().size());
        assertEquals(f.quote.total(), overview.totals().customerPaid()); assertEquals(1, overview.totals().customerPayments());
        assertEquals("338.52", overview.totals().chefEarned()); assertEquals(1, overview.totals().chefOrders());
        assertEquals("338.52", overview.totals().chefPaid()); assertEquals(1, overview.totals().chefPayouts());
        assertEquals("0.00", overview.totals().refunded());
        // 369.00 food + 39.00 delivery + 5% food GST + 18% delivery GST; the chef pays a 7% fee plus 18% GST on that fee.
        var split = overview.split();
        assertEquals(f.quote.total(), split.delivered()); assertEquals("338.52", split.chefs()); assertEquals("25.83", split.cravesFees());
        assertEquals("39.00", split.deliveryCharges()); assertEquals("30.12", split.gst()); assertEquals("0.00", split.tdsHeld()); assertEquals("0.00", split.other());
        assertEquals(new BigDecimal(split.delivered()), new BigDecimal(split.chefs()).add(new BigDecimal(split.cravesFees()))
            .add(new BigDecimal(split.deliveryCharges())).add(new BigDecimal(split.gst())));
        assertEquals("0.00", overview.position().readyToPay()); assertEquals("0.00", overview.position().inProgress());
        assertTrue(overview.recording().on()); assertEquals(1, overview.recording().earningsRecorded()); assertEquals("RAZORPAYX", overview.recording().payoutMode());

        var page = list(null, null, null, 50);
        assertEquals(List.of("CHEF_PAYOUT", "CHEF_EARNING", "CUSTOMER_PAYMENT").stream().sorted().toList(), page.items().stream().map(FinanceInsightsService.Movement::kind).sorted().toList());
        assertEquals(3, page.summary().size()); assertNull(page.nextCursor());
        var paid = page.items().stream().filter(row -> row.kind().equals("CHEF_PAYOUT")).findFirst().orElseThrow();
        assertEquals("PAID", paid.status()); assertEquals("UTR2026TEST01", paid.reference()); assertEquals(f.chef, paid.partyId()); assertEquals("338.52", paid.amount());
        // A pasted bank reference or order ID finds its rows whatever dates are chosen.
        var byUtr = insights.movements(reader, today.minusDays(300), today.minusDays(299), null, null, null, "utr2026test", null, 50);
        assertEquals(List.of(payout), byUtr.items().stream().map(FinanceInsightsService.Movement::id).toList());
        var byOrder = insights.movements(reader, null, null, null, null, null, f.checkout.toString(), null, 50);
        assertEquals(Set.of("CUSTOMER_PAYMENT", "CHEF_EARNING"), new HashSet<>(byOrder.items().stream().map(FinanceInsightsService.Movement::kind).toList()));
        // The order number people quote is the first 8 characters of the kitchen's order ID, in either case; it brings the
        // customer's payment along with the earning, and an unrelated number brings nothing.
        for (String number : List.of(f.order.toString().substring(0, 8), f.order.toString().substring(0, 8).toUpperCase()))
            assertEquals(Set.of("CUSTOMER_PAYMENT", "CHEF_EARNING"), new HashSet<>(insights.movements(reader, null, null, null, null, null, number, null, 50)
                .items().stream().map(FinanceInsightsService.Movement::kind).toList()));
        assertEquals(List.of(payment), insights.movements(reader, null, null, "CUSTOMER_PAYMENT", null, null, f.checkout.toString().substring(0, 8), null, 50)
            .items().stream().map(FinanceInsightsService.Movement::id).toList());
        String unused = "0000000".concat(f.order.toString().startsWith("00000000") ? "1" : "0");
        assertEquals(0, insights.movements(reader, null, null, null, null, null, unused, null, 50).items().size());
        assertEquals(1, list("CHEF_EARNING", null, null, 50).items().size());
        assertEquals(1, insights.movements(reader, today, today, null, "PAID", f.chef, null, null, 50).items().size());

        var trail = insights.order(reader, f.checkout);
        assertEquals(f.customer, trail.customerId()); assertEquals(1, trail.payments().size());
        assertEquals(payment, trail.payments().getFirst().id()); assertNotNull(trail.payments().getFirst().recordedAt());
        var order = trail.orders().getFirst();
        assertEquals(f.order, order.chefOrderId()); assertEquals(f.chef, order.chefId()); assertEquals("DELIVERED", order.state()); assertEquals("POSTED", order.lastResult());
        assertEquals("338.52", order.split().chefPayable()); assertEquals("25.83", order.split().chefServiceFee()); assertEquals("4.65", order.split().chefFeeGst());
        assertEquals(f.quote.total(), order.split().customerTotal()); assertNotNull(order.earningRecordedAt());
        assertEquals(payout, order.payout().id()); assertEquals("PAID", order.payout().status()); assertEquals("UTR2026TEST01", order.payout().reference()); assertNotNull(order.payout().paidAt());
        assertEquals(Set.of("PAYMENT_CAPTURED", "CHEF_ORDER_EARNING"), new HashSet<>(trail.journal().stream().map(FinanceInsightsService.JournalEntry::eventType).toList()));
        assertEquals(2, trail.journal().size());
        for (var entry : trail.journal()) assertEquals(
            entry.lines().stream().map(line -> new BigDecimal(line.debit())).reduce(BigDecimal.ZERO, BigDecimal::add),
            entry.lines().stream().map(line -> new BigDecimal(line.credit())).reduce(BigDecimal.ZERO, BigDecimal::add));

        var paidTrail = insights.payout(reader, payout);
        assertEquals("PAID", paidTrail.payout().status()); assertEquals("pout_test", paidTrail.payout().providerId()); assertNotNull(paidTrail.payout().paidAt());
        assertEquals(List.of(f.order), paidTrail.orders().stream().map(FinanceInsightsService.PaidOrder::chefOrderId).toList());
        assertEquals(f.checkout, paidTrail.orders().getFirst().checkoutId()); assertEquals("0.00", paidTrail.referralRewards());
        assertTrue(paidTrail.events().stream().map(FinanceInsightsService.PayoutEvent::action).toList().containsAll(List.of("RESERVED", "PAID")));
        assertEquals(List.of("CHEF_PAYOUT_CONFIRMED"), paidTrail.journal().stream().map(FinanceInsightsService.JournalEntry::eventType).toList());

        var chefs = insights.chefs(reader);
        assertEquals(1, chefs.chefs().size());
        assertEquals("338.52", chefs.chefs().getFirst().paid()); assertEquals("0.00", chefs.chefs().getFirst().due()); assertNotNull(chefs.chefs().getFirst().lastPaidAt());
        // A chef the payout engine knows but who has earned nothing is listed with zeros, so a hold can be placed early,
        // and counts for nothing in the totals.
        UUID newcomer = UUID.randomUUID();
        f.jdbc.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_reason) VALUES (?,false,NULL)", newcomer);
        var known = insights.chefs(reader);
        var idle = known.chefs().stream().filter(row -> row.chefId().equals(newcomer)).findFirst().orElseThrow();
        assertEquals(2, known.chefs().size()); assertEquals("0.00", idle.due()); assertEquals("0.00", idle.paid()); assertEquals(0, idle.orders());
        assertEquals(chefs.position(), known.position());
    }

    @Test void moneyStillOwedShowsAsHeldThenReadyAndRefundsAndRiderPayoutsAreCounted() {
        UUID payment = deliver();
        // No verified bank yet: the earning exists but cannot be paid.
        var held = insights.chefs(reader);
        assertTrue(held.chefs().getFirst().onHold()); assertEquals("338.52", held.chefs().getFirst().due());
        assertEquals("338.52", held.position().onHold()); assertEquals("0.00", held.position().readyToPay()); assertEquals(1, held.position().chefsOnHold());
        releaseBank();
        var ready = insights.overview(reader, today, today).position();
        assertEquals("338.52", ready.readyToPay()); assertEquals("0.00", ready.onHold()); assertEquals(1, ready.chefsToPay());
        // Reserved but not yet confirmed by the bank: in progress, and listed for attention.
        f.tx.execute(s -> f.payouts.withdraw(chef(), new ChefPayoutService.Withdrawal(UUID.randomUUID(), "338.52")));
        var moving = insights.overview(reader, today, today);
        assertEquals("338.52", moving.position().inProgress()); assertEquals("0.00", moving.position().readyToPay());
        assertEquals(1, moving.attention().payoutsToConfirm()); assertEquals("0.00", moving.totals().chefPaid());

        f.jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,provider,provider_refund_id,reason,processed_at) VALUES (?,?,?,?,'INR','SUCCESS','RAZORPAY','rfnd_test1','Customer asked',now())",
            UUID.randomUUID(), payment, "refund/one", new BigDecimal("50.00"));
        f.jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,provider) VALUES (?,?,?,?,'INR','FAILED','RAZORPAY')",
            UUID.randomUUID(), payment, "refund/two", new BigDecimal("20.00"));
        UUID rider = UUID.randomUUID(), account = UUID.randomUUID(), batch = UUID.randomUUID(), riderPayout = UUID.randomUUID(), maker = UUID.randomUUID(), checker = UUID.randomUUID();
        f.jdbc.update("INSERT INTO fleet_schema.rider(id,name,phone,created_by) VALUES (?,'Ravi Rider','+919876543210',?)", rider, maker);
        f.jdbc.update("INSERT INTO fleet_schema.rider_payout_account(id,rider_id,method,encrypted_details,fingerprint,masked_account,holder_name,verified_in_person,set_by,set_by_name) VALUES (?,?,'UPI','x','fp-1','r***@upi','Ravi Rider',true,?,'Tester')", account, rider, maker);
        f.jdbc.update("INSERT INTO fleet_schema.rider_payout_batch(id,kind,payout_date,status,created_by,created_by_name,approved_by,approved_by_name,approved_at,sent_at) VALUES (?,'DAILY_WITHDRAWAL',current_date,'SENT',?,'Maker',?,'Checker',now(),now())", batch, maker, checker);
        f.jdbc.update("INSERT INTO fleet_schema.rider_payout_instruction(id,rider_id,kind,payout_date,amount_paise,payout_account_id,state,utr,marked_by,marked_by_name,marked_at,batch_id) VALUES (?,?,'DAILY_WITHDRAWAL',current_date,12550,?,'PAID','RIDERUTR123',?,'Checker',now(),?)", riderPayout, rider, account, checker, batch);

        var overview = insights.overview(reader, today, today);
        assertEquals("50.00", overview.totals().refunded()); assertEquals(1, overview.totals().refunds());
        assertEquals("125.50", overview.totals().riderPaid()); assertEquals(1, overview.totals().riderPayouts());
        assertEquals(1, overview.attention().refundsStuck()); assertEquals(0, overview.attention().riderPayoutsOpen());
        assertEquals("50.00", overview.days().getFirst().refunded()); assertEquals("125.50", overview.days().getFirst().riderPaid());

        var refunds = list("REFUND", null, null, 50);
        assertEquals(2, refunds.items().size());
        assertTrue(refunds.items().stream().allMatch(row -> f.checkout.equals(row.checkoutId()) && f.customer.equals(row.partyId())));
        var riderRow = list(null, "ravi", null, 50).items();
        assertEquals(List.of(riderPayout), riderRow.stream().map(FinanceInsightsService.Movement::id).toList());
        assertEquals("Ravi Rider", riderRow.getFirst().partyName()); assertEquals("125.50", riderRow.getFirst().amount()); assertEquals("RIDERUTR123", riderRow.getFirst().reference());
        assertEquals(2, insights.order(reader, f.checkout).refunds().size());
    }

    @Test void bankTransferModeShowsWhatThePaymentScreenWouldLetAnAdminPay() {
        // Launch mode: admins pay chefs by bank transfer. The list must agree with the payment screen's own hold rule and amount.
        var manual = new ManualChefSettlementService(f.jdbc, f.json, f.policies, new LedgerPostingService(f.jdbc, f.json, true), true);
        var inManualMode = new FinanceInsightsService(f.jdbc, manual, true);
        deliver();
        var row = inManualMode.chefs(reader).chefs().getFirst();
        assertEquals("CRAVES_MANUAL", inManualMode.chefs(reader).payoutMode());
        assertEquals(manual.held(f.chef), row.onHold()); assertFalse(row.onHold());
        assertEquals(manual.available(f.chef).toPlainString(), row.due()); assertEquals("338.52", row.due());
        assertEquals("338.52", inManualMode.chefs(reader).position().readyToPay());
        // A refund in progress on the order holds the chef's money on both screens.
        f.jdbc.update("INSERT INTO payment_schema.refund(id,refund_ref,amount,currency,status,chef_sub_order_id) VALUES (?,?,?,'INR','REQUESTED',?)",
            UUID.randomUUID(), "refund/hold", new BigDecimal("100.00"), f.order);
        var held = inManualMode.chefs(reader);
        assertTrue(manual.held(f.chef)); assertTrue(held.chefs().getFirst().onHold());
        assertEquals("0.00", held.position().readyToPay()); assertEquals("338.52", held.position().onHold());
    }

    @Test void pagingReturnsEveryMovementOnceNewestFirst() {
        Instant base = Instant.now().minusSeconds(3600);
        for (int i = 0; i < 7; i++) {
            UUID id = UUID.randomUUID();
            f.jdbc.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,amount,currency,status,provider,created_at) VALUES (?,?,?,?,?,'INR','PAYMENT_PENDING','RAZORPAY',?)",
                id, UUID.randomUUID(), f.customer, "page/" + id, new BigDecimal("10.00"), Timestamp.from(base.plusSeconds(i == 3 ? 2 : i)));
        }
        List<FinanceInsightsService.Movement> seen = new ArrayList<>(); String cursor = null; int pages = 0;
        do { var page = list("CUSTOMER_PAYMENT", null, cursor, 3); seen.addAll(page.items()); cursor = page.nextCursor(); pages++;
            assertEquals(pages == 1 ? 1 : 0, page.summary().size()); } while (cursor != null);
        assertEquals(3, pages); assertEquals(7, seen.size()); assertEquals(7, seen.stream().map(FinanceInsightsService.Movement::id).distinct().count());
        for (int i = 1; i < seen.size(); i++) assertFalse(seen.get(i).at().isAfter(seen.get(i - 1).at()));
        assertEquals(7, list("CUSTOMER_PAYMENT", null, null, 50).summary().getFirst().count());
        assertEquals("70.00", list("CUSTOMER_PAYMENT", null, null, 50).summary().getFirst().amount());
        // Unpaid attempts never count as money received.
        assertEquals("0.00", insights.overview(reader, today.minusDays(1), today).totals().customerPaid());
    }

    @Test void onlyFinanceReadersMayReadAndBadRequestsAreRefused() {
        var outsider = new CravesPrincipal(UUID.randomUUID(), "", Set.of("SUPPORT_ADMIN"));
        assertStatus(403, () -> insights.overview(outsider, null, null));
        assertStatus(403, () -> insights.movements(outsider, null, null, null, null, null, null, null, 50));
        assertStatus(403, () -> insights.order(chef(), f.checkout));
        assertStatus(403, () -> insights.payout(chef(), UUID.randomUUID()));
        assertStatus(403, () -> insights.chefs(null));
        assertStatus(400, () -> insights.overview(reader, today.minusDays(400), today));
        assertStatus(400, () -> insights.overview(reader, today, today.minusDays(1)));
        assertStatus(400, () -> list("EVERYTHING", null, null, 50));
        assertStatus(400, () -> list(null, "a'; DROP TABLE x;--", null, 50));
        assertStatus(400, () -> list(null, "ab", null, 50));
        assertStatus(400, () -> list(null, null, "not-a-cursor", 50));
        assertStatus(400, () -> list(null, null, null, 101));
        assertStatus(400, () -> insights.movements(reader, null, null, null, "paid", null, null, null, 50));
        assertStatus(404, () -> insights.order(reader, UUID.randomUUID()));
        assertStatus(404, () -> insights.payout(reader, UUID.randomUUID()));
        // Nothing recorded yet is an answer, not an error: an empty month still has every day.
        var empty = insights.overview(reader, null, null);
        assertEquals(30, empty.days().size()); assertEquals("0.00", empty.totals().customerPaid()); assertEquals("0.00", empty.split().delivered());
        assertTrue(insights.chefs(reader).chefs().isEmpty());
        // An order that was quoted but never paid has a frozen split and nothing else.
        var quoted = insights.order(reader, f.checkout);
        assertTrue(quoted.payments().isEmpty()); assertEquals(1, quoted.orders().size()); assertNull(quoted.orders().getFirst().state());
    }
}
