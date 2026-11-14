package in.craves.integration.finance.insights;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.payout.ManualChefSettlementService;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only money views behind the admin Finance screens: totals by day, one list of every money movement, the trail of
 * one checkout or one chef payout, and what each chef is owed. Nothing here writes, and every method asks for the finance
 * read role. Amounts are rupee strings with two decimals; days are India calendar days.
 */
@Service
public class FinanceInsightsService {
    static final int MAX_DAYS = 366;
    static final Set<String> KINDS = Set.of("CUSTOMER_PAYMENT", "REFUND", "CHEF_EARNING", "CHEF_PAYOUT", "RIDER_PAYOUT");
    private static final String OPEN_PAYOUT = "('RESERVED','SUBMITTING','PROCESSING','UNKNOWN','REVIEW_REQUIRED')";

    public record Day(LocalDate day, String customerPaid, String refunded, String chefEarned, String chefPaid, String riderPaid) {}
    public record Totals(String customerPaid, long customerPayments, String refunded, long refunds, String chefEarned,
                         long chefOrders, String chefPaid, long chefPayouts, String riderPaid, long riderPayouts) {}
    /** Where the money of the orders delivered in the period went. The parts add up to {@code delivered}. */
    public record Split(String delivered, String chefs, String cravesFees, String deliveryCharges, String gst, String tdsHeld, String other) {}
    /** What Craves owes chefs right now, whatever period is shown. */
    public record Position(String readyToPay, String onHold, String notYetDue, String inProgress, long chefsToPay, long chefsOnHold) {}
    public record Attention(long payoutsToConfirm, long payoutsFailed, long refundsStuck, long ordersToReview, long riderPayoutsOpen) {}
    public record Recording(boolean on, long paymentsRecorded, long earningsRecorded, Instant lastEarningAt, String payoutMode) {}
    public record Overview(LocalDate from, LocalDate to, Instant generatedAt, Totals totals, List<Day> days, Split split,
                           Position position, Attention attention, Recording recording) {}

    public record Movement(String kind, UUID id, Instant at, String amount, String status, String reference, String channel,
                           String providerReference, String partyType, UUID partyId, String partyName, UUID checkoutId, UUID chefOrderId) {}
    public record KindTotal(String kind, long count, String amount) {}
    public record MovementPage(List<Movement> items, String nextCursor, List<KindTotal> summary) {}

    public record ChefBalance(UUID chefId, long orders, String due, String notYetDue, String inProgress, String paid,
                              Instant lastPaidAt, boolean onHold, String holdReason) {}
    public record ChefBalances(Instant generatedAt, String payoutMode, Position position, List<ChefBalance> chefs) {}

    public record Payment(UUID id, String reference, String provider, String providerOrderId, String providerPaymentId, String amount,
                          String status, String providerStatus, Instant createdAt, Instant updatedAt, Instant recordedAt) {}
    public record OrderSplit(String customerTotal, String customerFood, String delivery, String platformFee, String foodGst, String deliveryGst,
                             String platformGst, String chefGross, String chefServiceFee, String chefFeeGst, String withholding, String chefPayable) {}
    public record PayoutRef(UUID id, String amount, String status, String mode, String channel, String reference, Instant createdAt, Instant paidAt) {}
    public record Delivery(String orderCode, String kitchenName, String riderName, String riderPay, String state) {}
    public record ChefOrder(UUID chefOrderId, UUID chefId, UUID kitchenId, OrderSplit split, String state, String lastResult, Instant deliveredAt,
                            Instant earningRecordedAt, Instant payAvailableAt, PayoutRef payout, Delivery delivery) {}
    public record Refund(UUID id, String reference, UUID chefOrderId, String amount, String status, String providerStatus, String providerRefundId,
                         String reason, Instant requestedAt, Instant processedAt) {}
    public record JournalLine(String account, String debit, String credit) {}
    public record JournalEntry(UUID id, String eventType, Instant occurredAt, String evidence, List<JournalLine> lines) {}
    public record OrderTrail(UUID checkoutId, UUID customerId, List<Payment> payments, List<ChefOrder> orders, List<Refund> refunds,
                             List<JournalEntry> journal) {}

    public record PayoutDetail(UUID id, UUID chefId, String amount, String status, String mode, String channel, String providerId,
                               String providerStatus, String reference, String destinationReference, String lastError,
                               Instant createdAt, Instant authorizedAt, Instant paidAt, Instant updatedAt) {}
    public record PaidOrder(UUID chefOrderId, UUID checkoutId, String amount, Instant deliveredAt, boolean counted) {}
    public record PayoutEvent(Instant at, String action, String actor, String evidence) {}
    public record PayoutTrail(PayoutDetail payout, List<PaidOrder> orders, String referralRewards, List<PayoutEvent> events, List<JournalEntry> journal) {}

    private final JdbcTemplate jdbc;
    private final ManualChefSettlementService manual;
    private final boolean recordingOn;

    public FinanceInsightsService(JdbcTemplate jdbc, ManualChefSettlementService manual,
            @Value("${CRAVES_FINANCE_FINALIZATION_ENABLED:false}") boolean recordingOn) {
        this.jdbc = jdbc; this.manual = manual; this.recordingOn = recordingOn;
    }

    public Overview overview(CravesPrincipal actor, LocalDate from, LocalDate to) {
        FinancePolicyService.reader(actor);
        Range range = Range.of(from, to);
        Object[] bounds = new Object[12];
        bounds[0] = java.sql.Date.valueOf(range.from()); bounds[1] = java.sql.Date.valueOf(range.to());
        for (int i = 2; i < 12; i += 2) { bounds[i] = range.start(); bounds[i + 1] = range.end(); }
        BigDecimal[] sum = {BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO};
        long[] count = new long[5];
        List<Day> days = jdbc.query("""
            WITH days AS (SELECT generate_series(?::date,?::date,interval '1 day')::date AS day),
            paid AS (SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS n,sum(amount) AS amount
                       FROM payment_schema.payment_order WHERE status='PAID' AND amount>0 AND created_at>=? AND created_at<? GROUP BY 1),
            refunded AS (SELECT (coalesce(processed_at,updated_at) AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS n,sum(amount) AS amount
                       FROM payment_schema.refund WHERE status='SUCCESS' AND amount>0
                        AND coalesce(processed_at,updated_at)>=? AND coalesce(processed_at,updated_at)<? GROUP BY 1),
            earned AS (SELECT (delivered_at AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS n,sum(payable) AS amount
                       FROM payment_schema.finance_earning_projection WHERE delivered_at>=? AND delivered_at<? GROUP BY 1),
            chef_paid AS (SELECT (coalesce(manual_paid_at,updated_at) AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS n,sum(amount) AS amount
                       FROM payment_schema.finance_payout_instruction WHERE status='PAID'
                        AND coalesce(manual_paid_at,updated_at)>=? AND coalesce(manual_paid_at,updated_at)<? GROUP BY 1),
            rider_paid AS (SELECT (marked_at AT TIME ZONE 'Asia/Kolkata')::date AS day,count(*) AS n,sum(amount_paise)::numeric/100 AS amount
                       FROM fleet_schema.rider_payout_instruction WHERE state='PAID' AND marked_at>=? AND marked_at<? GROUP BY 1)
            SELECT d.day,coalesce(p.amount,0),coalesce(p.n,0),coalesce(r.amount,0),coalesce(r.n,0),coalesce(e.amount,0),coalesce(e.n,0),
                   coalesce(c.amount,0),coalesce(c.n,0),coalesce(k.amount,0),coalesce(k.n,0)
              FROM days d LEFT JOIN paid p USING(day) LEFT JOIN refunded r USING(day) LEFT JOIN earned e USING(day)
              LEFT JOIN chef_paid c USING(day) LEFT JOIN rider_paid k USING(day) ORDER BY d.day
            """, (rs, n) -> {
                for (int i = 0; i < 5; i++) { sum[i] = sum[i].add(rs.getBigDecimal(2 + i * 2)); count[i] += rs.getLong(3 + i * 2); }
                return new Day(rs.getObject(1, LocalDate.class), money(rs.getBigDecimal(2)), money(rs.getBigDecimal(4)),
                    money(rs.getBigDecimal(6)), money(rs.getBigDecimal(8)), money(rs.getBigDecimal(10)));
            }, bounds);
        Totals totals = new Totals(money(sum[0]), count[0], money(sum[1]), count[1], money(sum[2]), count[2],
            money(sum[3]), count[3], money(sum[4]), count[4]);
        Attention attention = jdbc.queryForObject("""
            SELECT (SELECT count(*) FROM payment_schema.finance_payout_instruction WHERE status IN %s),
                   (SELECT count(*) FROM payment_schema.finance_payout_instruction WHERE status IN ('FAILED','REVERSED') AND updated_at>now()-interval '30 days'),
                   (SELECT count(*) FROM payment_schema.refund WHERE recovery_required OR status IN ('DEAD_LETTER','ONHOLD')
                       OR (status='FAILED' AND updated_at>now()-interval '30 days')
                       OR (status IN ('REQUESTED','PROCESSING','RETRY','PENDING','BENEFITS_PENDING') AND created_at<now()-interval '24 hours')),
                   (SELECT count(*) FROM payment_schema.finance_order_binding WHERE state='REVIEW_REQUIRED'),
                   (SELECT count(*) FROM fleet_schema.rider_payout_instruction WHERE state IN ('PENDING','FAILED'))
            """.formatted(OPEN_PAYOUT), (rs, n) -> new Attention(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getLong(5)));
        Recording recording = jdbc.queryForObject("""
            SELECT (SELECT count(*) FROM payment_schema.finance_capture),(SELECT count(*) FROM payment_schema.finance_earning_projection),
                   (SELECT max(created_at) FROM payment_schema.finance_earning_projection)
            """, (rs, n) -> new Recording(recordingOn, rs.getLong(1), rs.getLong(2), instant(rs, 3), payoutMode()));
        return new Overview(range.from(), range.to(), Instant.now(), totals, days, split(range), position(balances()), attention, recording);
    }

    private Split split(Range range) {
        Map<String, BigDecimal> accounts = new HashMap<>();
        jdbc.query("""
            SELECT l.account_code,sum(l.credit_amount-l.debit_amount) FROM payment_schema.ledger_transaction t
              JOIN payment_schema.ledger_line l ON l.transaction_id=t.id
             WHERE t.event_type='CHEF_ORDER_EARNING' AND t.business_date BETWEEN ? AND ? GROUP BY 1
            """, rs -> { accounts.put(rs.getString(1), rs.getBigDecimal(2)); },
            java.sql.Date.valueOf(range.from()), java.sql.Date.valueOf(range.to()));
        BigDecimal delivered = take(accounts, "CUSTOMER_FUNDS").negate(), chefs = take(accounts, "CHEF_PAYABLE"),
            fees = take(accounts, "CHEF_FEE_REVENUE", "PLATFORM_FEE_REVENUE", "CUSTOMER_UPLIFT_REVENUE"),
            delivery = take(accounts, "DELIVERY_REVENUE"),
            gst = take(accounts, "CHEF_FEE_GST_PAYABLE", "RESTAURANT_GST_PAYABLE", "DELIVERY_GST_PAYABLE", "PLATFORM_GST_PAYABLE", "TAX_PAYABLE"),
            tds = take(accounts, "WITHHOLDING_PAYABLE");
        // Whatever an order's journal credits outside the named groups still shows, so the parts always add up.
        BigDecimal other = delivered.subtract(chefs).subtract(fees).subtract(delivery).subtract(gst).subtract(tds);
        return new Split(money(delivered), money(chefs), money(fees), money(delivery), money(gst), money(tds), money(other));
    }

    public MovementPage movements(CravesPrincipal actor, LocalDate from, LocalDate to, String kind, String status, UUID party,
                                  String search, String cursor, int limit) {
        FinancePolicyService.reader(actor);
        if (limit < 1 || limit > 100) throw bad("limit must be between 1 and 100");
        if (kind != null && !KINDS.contains(kind)) throw bad("Unknown kind");
        if (status != null && !status.matches("[A-Z][A-Z_]{0,39}")) throw bad("Unknown status");
        StringBuilder where = new StringBuilder(" WHERE true");
        List<Object> args = new ArrayList<>();
        String text = search == null ? "" : search.trim();
        if (text.isEmpty()) {
            Range range = Range.of(from, to);
            where.append(" AND occurred>=? AND occurred<?"); args.add(range.start()); args.add(range.end());
        } else if (text.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) {
            // A pasted reference is looked for on every date: nobody remembers the day a payment ID belongs to.
            UUID id = UUID.fromString(text);
            where.append(" AND (id=? OR checkout_id=? OR chef_order_id=? OR party_id=?)");
            for (int i = 0; i < 4; i++) args.add(id);
        } else if (text.matches("[0-9a-fA-F]{8}")) {
            // The order number everyone quotes (#1A2B3C4D) is the first 8 characters of the kitchen's order ID. Every money
            // record of that checkout is returned, so the customer's payment shows even before the order is delivered.
            where.append(" AND (reference ILIKE ? OR provider_reference ILIKE ? OR party_name ILIKE ? OR left(chef_order_id::text,8)=? OR left(checkout_id::text,8)=?"
                + " OR checkout_id IN (SELECT s.checkout_id FROM payment_schema.finance_issued_snapshot s WHERE left(s.chef_order_id::text,8)=?"
                + " UNION SELECT t.order_id FROM fleet_schema.trip t WHERE t.order_code=?))");
            for (int i = 0; i < 3; i++) args.add("%" + text + "%");
            for (int i = 0; i < 3; i++) args.add(text.toLowerCase(Locale.ROOT));
            args.add("#" + text.toUpperCase(Locale.ROOT));
        } else if (text.matches("[A-Za-z0-9_-]{3,80}")) {
            where.append(" AND (reference ILIKE ? OR provider_reference ILIKE ? OR party_name ILIKE ?)");
            String like = "%" + text.replace("_", "\\_") + "%";
            for (int i = 0; i < 3; i++) args.add(like);
        } else throw bad("Search with at least 3 letters or digits, or a full ID");
        if (kind != null) { where.append(" AND kind=?"); args.add(kind); }
        if (status != null) { where.append(" AND status=?"); args.add(status); }
        if (party != null) { where.append(" AND party_id=?"); args.add(party); }
        List<KindTotal> summary = cursor != null ? List.of() : jdbc.query(
            "SELECT kind,count(*),coalesce(sum(amount),0) FROM (" + MOVEMENTS + ") m" + where + " GROUP BY kind ORDER BY kind",
            (rs, n) -> new KindTotal(rs.getString(1), rs.getLong(2), money(rs.getBigDecimal(3))), args.toArray());
        if (cursor != null) {
            String[] parts = cursor.split("_", 2);
            try { args.add(Timestamp.from(Instant.parse(parts[0]))); args.add(UUID.fromString(parts[1])); }
            catch (RuntimeException invalid) { throw bad("Invalid cursor"); }
            where.append(" AND (occurred,id)<(?,?)");
        }
        args.add(limit + 1);
        List<Movement> rows = jdbc.query("SELECT * FROM (" + MOVEMENTS + ") m" + where + " ORDER BY occurred DESC,id DESC LIMIT ?",
            (rs, n) -> new Movement(rs.getString("kind"), rs.getObject("id", UUID.class), rs.getTimestamp("occurred").toInstant(),
                money(rs.getBigDecimal("amount")), rs.getString("status"), rs.getString("reference"), rs.getString("channel"),
                rs.getString("provider_reference"), rs.getString("party_type"), rs.getObject("party_id", UUID.class),
                rs.getString("party_name"), rs.getObject("checkout_id", UUID.class), rs.getObject("chef_order_id", UUID.class)),
            args.toArray());
        boolean more = rows.size() > limit;
        List<Movement> items = more ? List.copyOf(rows.subList(0, limit)) : rows;
        return new MovementPage(items, more ? items.getLast().at() + "_" + items.getLast().id() : null, summary);
    }

    // shortcut: no index on these tables' dates, so each branch is scanned; add created_at indexes when payment_order passes ~200k rows.
    private static final String MOVEMENTS = """
        SELECT 'CUSTOMER_PAYMENT' AS kind,p.id,p.created_at AS occurred,p.amount,p.status::text AS status,p.craves_payment_order_ref::text AS reference,
               p.provider::text AS channel,p.provider_payment_id::text AS provider_reference,'CUSTOMER' AS party_type,
               p.customer_identity_id AS party_id,NULL::text AS party_name,p.checkout_id,NULL::uuid AS chef_order_id
          FROM payment_schema.payment_order p
        UNION ALL
        SELECT 'REFUND',r.id,coalesce(r.requested_at,r.created_at),r.amount,r.status,r.refund_ref,r.provider,r.provider_refund_id,'CUSTOMER',
               coalesce(r.customer_identity_id,o.customer_identity_id),NULL,coalesce(r.checkout_id,o.checkout_id),r.chef_sub_order_id
          FROM payment_schema.refund r LEFT JOIN payment_schema.payment_order o ON o.id=r.payment_order_id
        UNION ALL
        SELECT 'CHEF_EARNING',e.chef_order_id,e.delivered_at,e.payable,'RECORDED',NULL,NULL,NULL,'CHEF',e.chef_identity_id,NULL,e.checkout_id,e.chef_order_id
          FROM payment_schema.finance_earning_projection e
        UNION ALL
        SELECT 'CHEF_PAYOUT',i.id,i.created_at,i.amount,i.status,i.transfer_reference,i.payout_channel,i.provider_id,'CHEF',i.chef_identity_id,NULL,NULL,NULL
          FROM payment_schema.finance_payout_instruction i
        UNION ALL
        SELECT 'RIDER_PAYOUT',k.id,coalesce(k.marked_at,k.created_at),k.amount_paise::numeric/100,k.state,k.utr,k.kind,NULL,'RIDER',k.rider_id,d.name,NULL,NULL
          FROM fleet_schema.rider_payout_instruction k JOIN fleet_schema.rider d ON d.id=k.rider_id
        """;

    public ChefBalances chefs(CravesPrincipal actor) {
        FinancePolicyService.reader(actor);
        List<ChefBalance> rows = balances();
        return new ChefBalances(Instant.now(), payoutMode(), position(rows), rows);
    }

    /** The same rules as the chef's own balance: unreserved earnings past their waiting time, plus referral rewards, unless held. */
    private List<ChefBalance> balances() {
        return jdbc.query("""
            WITH sale AS (
              SELECT p.chef_identity_id AS chef,count(*) AS orders,
                     coalesce(sum(p.amount) FILTER (WHERE a.payable_id IS NULL AND p.manual_available_at<=now()),0) AS due,
                     coalesce(sum(p.amount) FILTER (WHERE a.payable_id IS NULL AND p.manual_available_at>now()),0) AS later
                FROM payment_schema.finance_payable p
                LEFT JOIN payment_schema.finance_payout_allocation a ON a.payable_id=p.id AND a.active
               GROUP BY 1),
            referral AS (SELECT chef_identity_id AS chef,sum(amount) AS due FROM payment_schema.finance_referral_available WHERE amount>0 GROUP BY 1),
            payout AS (
              SELECT chef_identity_id AS chef,coalesce(sum(amount) FILTER (WHERE status='PAID'),0) AS paid,
                     coalesce(sum(amount) FILTER (WHERE status IN %s),0) AS moving,
                     max(coalesce(manual_paid_at,updated_at)) FILTER (WHERE status='PAID') AS last_paid
                FROM payment_schema.finance_payout_instruction GROUP BY 1),
            -- Every chef the payout engine knows, so one can be put on hold before the first earning arrives.
            chefs AS (SELECT chef FROM sale UNION SELECT chef FROM referral UNION SELECT chef FROM payout
                      UNION SELECT chef_identity_id FROM payment_schema.finance_chef_payout_control)
            SELECT c.chef,coalesce(s.orders,0) AS orders,coalesce(s.due,0)+coalesce(r.due,0) AS due,coalesce(s.later,0) AS later,
                   coalesce(p.moving,0) AS moving,coalesce(p.paid,0) AS paid,p.last_paid,
                   CASE WHEN ? THEN payment_schema.finance_manual_money_held(c.chef)
                        ELSE coalesce((SELECT k.on_hold OR NOT payment_schema.finance_bank_ready(k.chef_identity_id,k.beneficiary_id)
                                         FROM payment_schema.finance_chef_payout_control k WHERE k.chef_identity_id=c.chef),true) END AS held,
                   (SELECT k.hold_reason FROM payment_schema.finance_chef_payout_control k WHERE k.chef_identity_id=c.chef AND k.on_hold) AS hold_reason
              FROM chefs c LEFT JOIN sale s USING(chef) LEFT JOIN referral r USING(chef) LEFT JOIN payout p USING(chef)
             ORDER BY 3 DESC,1 LIMIT 2000
            """.formatted(OPEN_PAYOUT), (rs, n) -> new ChefBalance(rs.getObject("chef", UUID.class), rs.getLong("orders"),
                money(rs.getBigDecimal("due")), money(rs.getBigDecimal("later")), money(rs.getBigDecimal("moving")),
                money(rs.getBigDecimal("paid")), instant(rs, 7), rs.getBoolean("held"), rs.getString("hold_reason")),
            manual.configured());
    }

    private static Position position(List<ChefBalance> chefs) {
        BigDecimal ready = BigDecimal.ZERO, held = BigDecimal.ZERO, later = BigDecimal.ZERO, moving = BigDecimal.ZERO;
        long toPay = 0, onHold = 0;
        for (ChefBalance chef : chefs) {
            BigDecimal due = new BigDecimal(chef.due()), waiting = new BigDecimal(chef.notYetDue());
            later = later.add(waiting); moving = moving.add(new BigDecimal(chef.inProgress()));
            if (chef.onHold()) { held = held.add(due); if (due.add(waiting).signum() > 0) onHold++; }
            else { ready = ready.add(due); if (due.signum() > 0) toPay++; }
        }
        return new Position(money(ready), money(held), money(later), money(moving), toPay, onHold);
    }

    public OrderTrail order(CravesPrincipal actor, UUID checkoutId) {
        FinancePolicyService.reader(actor);
        List<Payment> payments = jdbc.query("""
            SELECT p.id,p.craves_payment_order_ref,p.provider,p.provider_order_id,p.provider_payment_id,p.amount,p.status,p.provider_status,
                   p.created_at,p.updated_at,c.recorded_at,p.customer_identity_id
              FROM payment_schema.payment_order p LEFT JOIN payment_schema.finance_capture c ON c.payment_order_id=p.id
             WHERE p.checkout_id=? ORDER BY p.created_at,p.id
            """, (rs, n) -> new Payment(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                money(rs.getBigDecimal(6)), rs.getString(7), rs.getString(8), instant(rs, 9), instant(rs, 10), instant(rs, 11)), checkoutId);
        Map<UUID, Delivery> deliveries = new HashMap<>();
        jdbc.query("""
            SELECT t.chef_sub_order_id,t.order_code,t.kitchen_name,d.name,coalesce(t.final_pay_paise,t.pay_paise)::numeric/100,t.state
              FROM fleet_schema.trip t LEFT JOIN fleet_schema.rider d ON d.id=t.rider_id WHERE t.order_id=? AND t.replaced_at IS NULL
            """, rs -> { deliveries.put(rs.getObject(1, UUID.class), new Delivery(rs.getString(2), rs.getString(3), rs.getString(4),
                rs.getBigDecimal(5) == null ? null : money(rs.getBigDecimal(5)), rs.getString(6))); }, checkoutId);
        List<ChefOrder> orders = jdbc.query("""
            SELECT s.chef_order_id,s.chef_identity_id,s.payload,b.state,b.last_result,b.delivered_at,e.created_at AS earned_at,
                   y.manual_available_at,i.id AS payout_id,i.amount AS payout_amount,i.status AS payout_status,i.mode,i.payout_channel,
                   i.transfer_reference,i.created_at AS payout_created,
                   CASE WHEN i.status='PAID' THEN coalesce(i.manual_paid_at,i.updated_at) END AS payout_paid
              FROM payment_schema.finance_issued_snapshot s
              LEFT JOIN payment_schema.finance_order_binding b ON b.chef_order_id=s.chef_order_id
              LEFT JOIN payment_schema.finance_earning_projection e ON e.chef_order_id=s.chef_order_id
              LEFT JOIN payment_schema.finance_payable y ON y.chef_order_id=s.chef_order_id
              LEFT JOIN payment_schema.finance_payout_allocation a ON a.payable_id=y.id AND a.active
              LEFT JOIN payment_schema.finance_payout_instruction i ON i.id=a.instruction_id
             WHERE s.checkout_id=? ORDER BY s.issued_at,s.chef_order_id
            """, (rs, n) -> {
                UUID chefOrder = rs.getObject("chef_order_id", UUID.class);
                var payload = Json.object(rs.getString("payload"));
                OrderSplit split = new OrderSplit(payload.get("customerTotal"), payload.get("customerFood"), payload.get("delivery"),
                    payload.get("platform"), payload.get("foodGst"), payload.get("deliveryGst"), payload.get("platformGst"),
                    payload.get("chefGross"), payload.get("chefServiceFee"), payload.get("chefFeeGst"), payload.get("withholding"), payload.get("chefPayable"));
                UUID payoutId = rs.getObject("payout_id", UUID.class);
                PayoutRef payout = payoutId == null ? null : new PayoutRef(payoutId, money(rs.getBigDecimal("payout_amount")), rs.getString("payout_status"),
                    rs.getString("mode"), rs.getString("payout_channel"), rs.getString("transfer_reference"), instant(rs, 15), instant(rs, 16));
                String kitchen = payload.get("kitchenId");
                return new ChefOrder(chefOrder, rs.getObject("chef_identity_id", UUID.class), kitchen == null ? null : UUID.fromString(kitchen), split,
                    rs.getString("state"), rs.getString("last_result"), instant(rs, 6), instant(rs, 7), instant(rs, 8), payout, deliveries.remove(chefOrder));
            }, checkoutId);
        // An order placed while earnings were not being recorded has no frozen split; its delivery is still shown.
        List<ChefOrder> all = new ArrayList<>(orders);
        deliveries.forEach((chefOrder, delivery) -> all.add(new ChefOrder(chefOrder, null, null, null, null, null, null, null, null, null, delivery)));
        List<Refund> refunds = jdbc.query("""
            SELECT r.id,r.refund_ref,r.chef_sub_order_id,r.amount,r.status,r.provider_status,r.provider_refund_id,r.reason,
                   coalesce(r.requested_at,r.created_at),r.processed_at
              FROM payment_schema.refund r
             WHERE r.checkout_id=? OR r.payment_order_id IN (SELECT id FROM payment_schema.payment_order WHERE checkout_id=?)
             ORDER BY 9,1
            """, (rs, n) -> new Refund(rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, UUID.class), money(rs.getBigDecimal(4)),
                rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8), instant(rs, 9), instant(rs, 10)), checkoutId, checkoutId);
        if (payments.isEmpty() && all.isEmpty() && refunds.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No money records for this order");
        UUID customer = jdbc.query("SELECT customer_identity_id FROM payment_schema.payment_order WHERE checkout_id=? ORDER BY created_at LIMIT 1",
            (rs, n) -> rs.getObject(1, UUID.class), checkoutId).stream().findFirst().orElse(null);
        return new OrderTrail(checkoutId, customer, payments, all, refunds, journal(
            "t.checkout_id=? OR t.chef_order_id IN (SELECT chef_order_id FROM payment_schema.finance_issued_snapshot WHERE checkout_id=?)", checkoutId, checkoutId));
    }

    public PayoutTrail payout(CravesPrincipal actor, UUID payoutId) {
        FinancePolicyService.reader(actor);
        PayoutDetail payout = jdbc.query("SELECT * FROM payment_schema.finance_payout_instruction WHERE id=?", (rs, n) -> new PayoutDetail(
            payoutId, rs.getObject("chef_identity_id", UUID.class), money(rs.getBigDecimal("amount")), rs.getString("status"), rs.getString("mode"),
            rs.getString("payout_channel"), rs.getString("provider_id"), rs.getString("provider_status"), rs.getString("transfer_reference"),
            rs.getString("manual_destination_reference"), rs.getString("last_error"), time(rs, "created_at"), time(rs, "manual_authorized_at"),
            "PAID".equals(rs.getString("status")) ? time(rs, rs.getTimestamp("manual_paid_at") == null ? "updated_at" : "manual_paid_at") : null,
            time(rs, "updated_at")), payoutId).stream().findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payout not found"));
        List<PaidOrder> orders = jdbc.query("""
            SELECT y.chef_order_id,e.checkout_id,y.amount,y.delivered_at,a.active
              FROM payment_schema.finance_payout_allocation a JOIN payment_schema.finance_payable y ON y.id=a.payable_id
              LEFT JOIN payment_schema.finance_earning_projection e ON e.chef_order_id=y.chef_order_id
             WHERE a.instruction_id=? ORDER BY y.delivered_at,y.chef_order_id
            """, (rs, n) -> new PaidOrder(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), money(rs.getBigDecimal(3)), instant(rs, 4), rs.getBoolean(5)), payoutId);
        BigDecimal referral = jdbc.queryForObject("SELECT coalesce(sum(amount),0) FROM payment_schema.finance_referral_allocation WHERE instruction_id=?", BigDecimal.class, payoutId);
        List<PayoutEvent> events = jdbc.query("SELECT created_at,action,actor,evidence_reference FROM payment_schema.finance_payout_audit WHERE instruction_id=? ORDER BY created_at,id",
            (rs, n) -> new PayoutEvent(instant(rs, 1), rs.getString(2), rs.getString(3), rs.getString(4)), payoutId);
        return new PayoutTrail(payout, orders, money(referral), events,
            journal("t.id IN (SELECT transaction_id FROM payment_schema.ledger_line WHERE payout_instruction_id=?)", payoutId));
    }

    private List<JournalEntry> journal(String condition, Object... args) {
        Map<UUID, List<JournalLine>> lines = new HashMap<>();
        jdbc.query("SELECT l.transaction_id,l.account_code,l.debit_amount,l.credit_amount FROM payment_schema.ledger_line l JOIN payment_schema.ledger_transaction t ON t.id=l.transaction_id WHERE "
            + condition + " ORDER BY l.transaction_id,l.sequence",
            rs -> { lines.computeIfAbsent(rs.getObject(1, UUID.class), id -> new ArrayList<>())
                .add(new JournalLine(rs.getString(2), money(rs.getBigDecimal(3)), money(rs.getBigDecimal(4)))); }, args);
        return jdbc.query("SELECT t.id,t.event_type,t.occurred_at,t.evidence_reference FROM payment_schema.ledger_transaction t WHERE " + condition
            + " ORDER BY t.occurred_at,t.posted_at,t.id LIMIT 200",
            (rs, n) -> new JournalEntry(rs.getObject(1, UUID.class), rs.getString(2), instant(rs, 3), rs.getString(4),
                lines.getOrDefault(rs.getObject(1, UUID.class), List.of())), args);
    }

    private String payoutMode() { return manual.configured() ? "CRAVES_MANUAL" : "RAZORPAYX"; }

    record Range(LocalDate from, LocalDate to) {
        static Range of(LocalDate from, LocalDate to) {
            LocalDate end = to == null ? LocalDate.now(FinancePolicy.ZONE) : to, start = from == null ? end.minusDays(29) : from;
            if (start.isAfter(end) || start.plusDays(MAX_DAYS).isBefore(end) || start.getYear() < 2020 || end.getYear() > 2100)
                throw bad("Choose a period of at most " + MAX_DAYS + " days");
            return new Range(start, end);
        }
        Timestamp start() { return Timestamp.from(from.atStartOfDay(FinancePolicy.ZONE).toInstant()); }
        Timestamp end() { return Timestamp.from(to.plusDays(1).atStartOfDay(FinancePolicy.ZONE).toInstant()); }
    }

    private static BigDecimal take(Map<String, BigDecimal> accounts, String... codes) {
        BigDecimal total = BigDecimal.ZERO;
        for (String code : codes) { BigDecimal value = accounts.get(code); if (value != null) total = total.add(value); }
        return total;
    }
    static String money(BigDecimal value) { return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP).toPlainString(); }
    private static Instant instant(ResultSet rs, int column) throws SQLException { Timestamp value = rs.getTimestamp(column); return value == null ? null : value.toInstant(); }
    private static Instant time(ResultSet rs, String column) throws SQLException { Timestamp value = rs.getTimestamp(column); return value == null ? null : value.toInstant(); }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }

    /** The frozen order split is flat text fields; read only those, never the whole policy snapshot. */
    private static final class Json {
        private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER = new com.fasterxml.jackson.databind.ObjectMapper();
        interface Fields { String get(String name); }
        static Fields object(String text) {
            try { var node = MAPPER.readTree(text); return name -> node.path(name).isTextual() ? node.path(name).asText() : null; }
            catch (Exception invalid) { throw new IllegalStateException("Stored order split is not readable", invalid); }
        }
    }
}
