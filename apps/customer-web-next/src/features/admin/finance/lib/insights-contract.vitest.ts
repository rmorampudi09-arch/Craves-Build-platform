import { describe, expect, it } from "vitest";
import { bucketDays, chefNames, compactRupees, flowSign, fromPaise, initialView, insightsRequest, isZero, KINDS, movementPageSchema, movementsCsv, niceCeiling, orderNumber,
  overviewSchema, paise, rupees, statusesOf, statusOf, type Movement, type Overview } from "./insights-contract";
import { orderStops, payoutStops } from "./trail-stops";

const ID = "0bde0000-1111-4222-8333-444455556666", OTHER = "1bde0000-1111-4222-8333-444455556666";
const ask = (query: string) => insightsRequest(new URLSearchParams(query))?.path ?? null;
const movement = (over: Partial<Movement>): Movement => ({ kind: "CUSTOMER_PAYMENT", id: ID, at: "2026-11-14T03:00:00Z", amount: "458.00", status: "PAID", reference: null,
  channel: null, providerReference: null, partyType: "CUSTOMER", partyId: null, partyName: null, checkoutId: OTHER, chefOrderId: null, ...over });

describe("finance insights: what the browser may ask for", () => {
  it("turns each view into exactly one backend read", () => {
    expect(ask("view=overview&from=2026-10-16&to=2026-11-14")).toBe("/admin/finance/insights/overview?from=2026-10-16&to=2026-11-14");
    expect(ask("view=transactions&kind=REFUND&status=SUCCESS&limit=50")).toBe("/admin/finance/insights/transactions?kind=REFUND&status=SUCCESS&limit=50");
    expect(ask(`view=transactions&search=0BDE0000&party=${ID}`)).toBe(`/admin/finance/insights/transactions?party=${ID}&search=0BDE0000`);
    expect(ask(`view=order&id=${ID}`)).toBe(`/admin/finance/insights/orders/${ID}`);
    expect(ask(`view=payout&id=${ID}`)).toBe(`/admin/finance/insights/payouts/${ID}`);
    expect(ask("view=chefs")).toBe("/admin/finance/insights/chefs");
  });
  it("refuses anything else before it can reach the backend", () => {
    for (const query of ["", "view=policies", "view=overview&from=14-11-2026", "view=overview&extra=1", "view=overview&view=chefs", "view=order&id=../settings",
      "view=order", "view=transactions&limit=5000", "view=transactions&kind=EVERYTHING", "view=transactions&search=a%20b", "view=transactions&search=ab",
      "view=transactions&cursor=x", `view=chefs&id=${ID}`, "view=transactions&status=paid"]) expect(ask(query), query).toBeNull();
  });
  it("opens a shared link on the right tab and ignores what it does not understand", () => {
    expect(initialView({})).toEqual({ tab: "overview", from: "", to: "", search: "" });
    expect(initialView({ tab: "payouts", from: "2026-11-01", to: "2026-11-14" })).toEqual({ tab: "payouts", from: "2026-11-01", to: "2026-11-14", search: "" });
    expect(initialView({ tab: "settings", q: "UTR406317998120" })).toMatchObject({ tab: "transactions", search: "UTR406317998120" });
    expect(initialView({ tab: "nonsense", from: "2026-11-14", to: "2026-11-01", q: "<script>" })).toEqual({ tab: "overview", from: "", to: "", search: "" });
    expect(initialView({ tab: ["payouts", "settings"], from: "yesterday" })).toEqual({ tab: "overview", from: "", to: "", search: "" });
  });
  it("accepts money only as exact rupee strings", () => {
    const page = { items: [movement({})], nextCursor: null, summary: [{ kind: "CUSTOMER_PAYMENT", count: 1, amount: "458.00" }] };
    expect(movementPageSchema.safeParse(page).success).toBe(true);
    expect(movementPageSchema.safeParse({ ...page, items: [{ ...movement({}), amount: 458 }] }).success).toBe(false);
    expect(movementPageSchema.safeParse({ ...page, items: [movement({ amount: "458.0" })] }).success).toBe(false);
    expect(overviewSchema.safeParse({}).success).toBe(false);
  });
});

describe("finance insights: how money is written", () => {
  it("groups rupees the Indian way from the exact string", () => {
    expect(rupees("0.00")).toBe("₹0.00");
    expect(rupees("999.50")).toBe("₹999.50");
    expect(rupees("1000.00")).toBe("₹1,000.00");
    expect(rupees("184300.50")).toBe("₹1,84,300.50");
    expect(rupees("12345678901.05")).toBe("₹12,34,56,78,901.05");
    expect(rupees("-349.00")).toBe("−₹349.00");
    expect(rupees("349.00", "-")).toBe("−₹349.00");
    expect(rupees("458.00", "+")).toBe("+₹458.00");
  });
  it("never puts a sign on zero", () => {
    expect(rupees("0.00", "-")).toBe("₹0.00");
    expect(rupees("-0.00")).toBe("₹0.00");
    expect(isZero("0.00") && isZero("-0.00") && !isZero("0.01")).toBe(true);
  });
  it("adds and subtracts in paise, not floats", () => {
    expect(fromPaise(paise("0.10") + paise("0.20"))).toBe("0.30");
    expect(fromPaise(paise("426403.00") - paise("1047.00"))).toBe("425356.00");
    expect(fromPaise(paise("1.00") - paise("1.05"))).toBe("-0.05");
  });
  it("signs a row only when its money really moved", () => {
    expect(flowSign({ kind: "CUSTOMER_PAYMENT", status: "PAID" })).toBe("+");
    expect(flowSign({ kind: "REFUND", status: "SUCCESS" })).toBe("-");
    expect(flowSign({ kind: "CHEF_PAYOUT", status: "PAID" })).toBe("-");
    expect(flowSign({ kind: "RIDER_PAYOUT", status: "PAID" })).toBe("-");
    for (const row of [{ kind: "CUSTOMER_PAYMENT", status: "FAILED" }, { kind: "CUSTOMER_PAYMENT", status: "PAYMENT_PENDING" }, { kind: "REFUND", status: "FAILED" },
      { kind: "CHEF_PAYOUT", status: "UNKNOWN" }, { kind: "CHEF_PAYOUT", status: "SUBMITTING" }, { kind: "CHEF_PAYOUT", status: "REVERSED" },
      { kind: "RIDER_PAYOUT", status: "PENDING" }, { kind: "CHEF_EARNING", status: "RECORDED" }] as const) expect(flowSign(row), `${row.kind} ${row.status}`).toBe("");
  });
  it("names statuses in plain words and still shows one it has never seen", () => {
    expect(statusOf("CHEF_PAYOUT", "UNKNOWN")).toEqual({ label: "Outcome not known", tone: "danger" });
    expect(statusOf("REFUND", "SUCCESS")).toEqual({ label: "Refunded", tone: "success" });
    expect(statusOf("RIDER_PAYOUT", "SOMETHING_NEW")).toEqual({ label: "Something new", tone: "neutral" });
    // The status filter lists these words, so two statuses of one kind must never read the same.
    for (const kind of KINDS) { const labels = statusesOf(kind).map(status => statusOf(kind, status).label); expect(new Set(labels).size, kind).toBe(labels.length); }
  });
  it("tells chefs who share a name apart by their short ID, and leaves every other name as it is", () => {
    const names = chefNames([{ identityId: ID, displayName: "Asha R" }, { identityId: OTHER, displayName: "asha r" }, { identityId: "2bde0000-1111-4222-8333-444455556666", displayName: "Lakshmi’s Kitchen" },
      { identityId: 7, displayName: "No ID" }, null]);
    expect([...names]).toEqual([[ID, "Asha R · 0BDE0000"], [OTHER, "asha r · 1BDE0000"], ["2bde0000-1111-4222-8333-444455556666", "Lakshmi’s Kitchen"]]);
    expect(chefNames({ code: "SESSION_EXPIRED" }).size).toBe(0);
  });
  it("writes the order number the way the rest of Craves does", () => {
    expect(orderNumber(ID)).toBe("#0BDE0000");
  });
  it("keeps a downloaded sheet from running a reference as a formula", () => {
    const csv = movementsCsv([movement({ reference: "=HYPERLINK(\"x\")", providerReference: "+91", chefOrderId: ID }), movement({ kind: "REFUND", status: "FAILED", reference: "CRV-RF-1" })], () => "Asha \"A\"");
    const [head, first, second] = csv.split("\r\n");
    expect(head).toBe("time_utc,type,who,amount_inr,status,reference,provider_reference,order_number,checkout_id,record_id");
    expect(first).toContain(`"'=HYPERLINK(""x"")"`);
    expect(first).toContain(`"'+91"`);
    expect(first).toContain(`"Asha ""A"""`);
    expect(first).toContain(`"#0BDE0000"`);
    expect(second).toContain(`"Refund","Asha ""A""","458.00","Refund failed","CRV-RF-1"`);
  });
});

describe("finance insights: the chart's periods and scale", () => {
  const days = (count: number, start = "2026-01-01"): Overview["days"] => Array.from({ length: count }, (_, index) => {
    const date = new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + index);
    return { day: date.toISOString().slice(0, 10), customerPaid: "100.00", refunded: "1.00", chefEarned: "70.00", chefPaid: "50.00", riderPaid: "5.00" };
  });
  it("draws a bar a day up to two months, then weeks, then months, without losing a rupee", () => {
    expect(bucketDays(days(30))).toHaveLength(30);
    expect(bucketDays(days(62))).toHaveLength(62);
    const weeks = bucketDays(days(90));
    expect(weeks.length).toBeGreaterThanOrEqual(13); expect(weeks.length).toBeLessThanOrEqual(14);
    expect(weeks[1]).toMatchObject({ from: "2026-01-05", to: "2026-01-11", moneyIn: 70000n, chefPaid: 35000n }); // Monday to Sunday
    const months = bucketDays(days(365));
    expect(months).toHaveLength(12);
    expect(months[1]).toMatchObject({ from: "2026-02-01", to: "2026-02-28", moneyIn: 280000n });
    for (const buckets of [weeks, months]) expect(buckets.reduce((sum, bucket) => sum + bucket.moneyIn, 0n)).toBe(BigInt(buckets === weeks ? 90 : 365) * 10000n);
  });
  it("rounds the axis up to 1, 2 or 5 times a power of ten", () => {
    expect(niceCeiling(0n)).toBe(0n);
    expect(niceCeiling(1n)).toBe(100n);
    expect(niceCeiling(1921900n)).toBe(2000000n);
    expect(niceCeiling(2000000n)).toBe(2000000n);
    expect(niceCeiling(2000001n)).toBe(5000000n);
    expect(niceCeiling(9990000n)).toBe(10000000n);
    expect(compactRupees(5000000n)).toBe("₹50K");
    expect(compactRupees(10000000n)).toBe("₹1L");
  });
});

describe("finance insights: the money trail", () => {
  const split = { customerTotal: "458.00", customerFood: "369.00", delivery: "39.00", platformFee: "21.21", foodGst: "18.45", deliveryGst: "7.02", platformGst: "3.32",
    chefGross: "369.00", chefServiceFee: "25.83", chefFeeGst: "4.65", withholding: "0.00", chefPayable: "338.52" };
  const payment = { id: ID, reference: "CRV-PAY-1", provider: "RAZORPAY", providerOrderId: null, providerPaymentId: "pay_1", amount: "458.00", status: "PAID", providerStatus: "captured",
    createdAt: "2026-11-14T02:00:00Z", updatedAt: "2026-11-14T02:01:00Z", recordedAt: "2026-11-14T02:02:00Z" };
  const order = { chefOrderId: OTHER, chefId: ID, kitchenId: null, split, state: "DELIVERED", lastResult: "POSTED", deliveredAt: "2026-11-14T03:00:00Z",
    earningRecordedAt: "2026-11-14T03:01:00Z", payAvailableAt: "2026-11-15T03:00:00Z", payout: null, delivery: null };
  const trail = { checkoutId: ID, customerId: null, payments: [payment], orders: [order], refunds: [], journal: [] };
  const now = Date.parse("2026-11-14T04:00:00Z");
  const titles = (stops: ReturnType<typeof orderStops>) => stops.map(stop => `${stop.state}: ${stop.title}`);

  it("follows a delivered order from the payment to what the chef is owed, and the parts add up", () => {
    const stops = orderStops(trail, order, now);
    expect(titles(stops)).toEqual(["done: Customer paid ₹458.00", "done: Order total ₹458.00", "done: Delivered", "done: Chef earned ₹338.52", "waiting: Not paid to the chef yet"]);
    expect(stops[1].sum).toEqual([["Food", "369.00"], ["Delivery", "39.00"], ["Platform fee", "21.21"], ["GST", "28.79"], ["Customer pays", "458.00"]]);
    expect(stops[3].sum?.at(-1)).toEqual(["Chef gets", "338.52"]);
    expect(stops[4].note).toMatch(/waiting time/);
    expect(orderStops(trail, order, Date.parse("2026-11-16T00:00:00Z"))[4].note).toBe("Ready to be paid from Payouts.");
  });
  it("ends at the chef's bank once the payout is paid, and flags one whose outcome is not known", () => {
    const paid = { id: ID, amount: "12860.00", status: "PAID", mode: "MANUAL", channel: "CRAVES_MANUAL", reference: "UTR1", createdAt: "2026-11-14T05:00:00Z", paidAt: "2026-11-14T06:00:00Z" };
    expect(orderStops(trail, { ...order, payout: paid }, now).at(-1)).toMatchObject({ state: "done", title: "Paid to the chef's bank", payoutId: ID, at: "2026-11-14T06:00:00Z" });
    expect(orderStops(trail, { ...order, payout: { ...paid, status: "UNKNOWN", paidAt: null } }, now).at(-1)).toMatchObject({ state: "problem", title: "Payout: outcome not known" });
  });
  it("never shows an unpaid, cancelled or held order as earned", () => {
    const failed = { ...trail, payments: [{ ...payment, status: "FAILED" }] };
    expect(titles(orderStops(failed, { ...order, state: "CANCELLED", deliveredAt: null, earningRecordedAt: null }, now)))
      .toEqual(["problem: Customer has not paid", "done: Order total ₹458.00", "skipped: Order cancelled"]);
    const held = orderStops(trail, { ...order, state: "REVIEW_REQUIRED", lastResult: "REFUND_RESERVATION_EXISTS", deliveredAt: null, earningRecordedAt: null }, now);
    expect(titles(held).slice(2)).toEqual(["problem: Held for a check", "problem: Chef will earn ₹338.52"]);
    expect(held[3].note).toMatch(/refund is open/);
  });
  it("shows refunds on their own order, and still shows them when no kitchen order was recorded", () => {
    const refund = { id: OTHER, reference: "CRV-RF-1", chefOrderId: OTHER, amount: "349.00", status: "SUCCESS", providerStatus: null, providerRefundId: "rfnd_1", reason: "Item missing",
      requestedAt: "2026-11-14T03:30:00Z", processedAt: "2026-11-14T03:40:00Z" };
    const refunded = { ...trail, refunds: [refund, { ...refund, id: ID, chefOrderId: ID, status: "FAILED" }] };
    expect(titles(orderStops(refunded, order, now)).at(-1)).toBe("done: Refund of ₹349.00: refunded");
    expect(titles(orderStops({ ...refunded, orders: [] }, null, now))).toEqual(["done: Customer paid ₹458.00", "skipped: Order total not recorded",
      "done: Refund of ₹349.00: refunded", "problem: Refund of ₹349.00: refund failed"]);
  });
  it("tells an admin not to pay twice when a bank transfer's outcome is not known", () => {
    const payout = { id: ID, chefId: OTHER, amount: "2310.00", status: "UNKNOWN", mode: "MANUAL", channel: "CRAVES_MANUAL", providerId: null, providerStatus: null, reference: null,
      destinationReference: "Bank letter", lastError: null, createdAt: "2026-11-13T05:00:00Z", authorizedAt: "2026-11-13T05:10:00Z", paidAt: null, updatedAt: "2026-11-13T06:00:00Z" };
    const stops = payoutStops({ payout, orders: [], referralRewards: "0.00", events: [], journal: [] });
    expect(stops.map(stop => `${stop.state}: ${stop.title}`)).toEqual(["done: Amount set aside for this chef", "done: Bank transfer approved", "problem: Outcome not known"]);
    expect(stops[2].note).toMatch(/Do not send this money again/);
    expect(payoutStops({ payout: { ...payout, status: "PAID", reference: "UTR9", paidAt: "2026-11-13T07:00:00Z" }, orders: [], referralRewards: "0.00", events: [], journal: [] }).at(-1))
      .toMatchObject({ state: "done", title: "Paid to the chef's bank", note: "Bank reference UTR9." });
  });
});
