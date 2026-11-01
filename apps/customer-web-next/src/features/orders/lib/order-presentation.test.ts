import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOrderDate,
  orderAction,
  orderItemsLine,
  ordersInTab,
  orderStatusPill,
  orderTab,
  paymentStatus,
} from "./order-presentation.ts";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const STATUSES = ["PAYMENT_PENDING", "PAID", "CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CHEF_REJECTED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"];
const order = (status: string, minutesAgo = 5) => ({ status, createdAt: new Date(NOW - minutesAgo * 60_000).toISOString() });

test("tabs follow the app: delivered is completed, declines and refunds are cancelled", () => {
  const tabs = Object.fromEntries(STATUSES.map((status) => [status, orderTab(order(status), NOW)]));
  assert.deepEqual(tabs, {
    PAYMENT_PENDING: "UPCOMING", PAID: "UPCOMING", CHEF_ACCEPTANCE_PENDING: "UPCOMING", CHEF_ACCEPTED: "UPCOMING",
    PREPARING: "UPCOMING", READY_FOR_PICKUP: "UPCOMING", OUT_FOR_DELIVERY: "UPCOMING", DELIVERED: "COMPLETED",
    CHEF_REJECTED: "CANCELLED", CANCELLED: "CANCELLED", REFUND_PENDING: "CANCELLED", REFUNDED: "CANCELLED", REFUND_FAILED: "CANCELLED",
  });
  // An unpaid checkout left for more than 30 minutes never reached the kitchen.
  assert.equal(orderTab(order("PAYMENT_PENDING", 45), NOW), "CANCELLED");
  const list = [order("DELIVERED"), order("PREPARING"), order("CANCELLED")];
  assert.equal(ordersInTab(list, "ALL", NOW).length, 3);
  assert.deepEqual(ordersInTab(list, "UPCOMING", NOW), [list[1]]);
});

test("every status has its own pill words and colour", () => {
  const pills = STATUSES.map((status) => orderStatusPill(order(status), NOW));
  for (const pill of pills) assert.doesNotMatch(pill.label, /_|Order update/);
  assert.deepEqual(orderStatusPill(order("PAID"), NOW), { label: "Awaiting chef", tone: "warning" });
  assert.deepEqual(orderStatusPill(order("PREPARING"), NOW), { label: "Preparing", tone: "accent" });
  assert.deepEqual(orderStatusPill(order("OUT_FOR_DELIVERY"), NOW), { label: "Item picked up", tone: "accent" });
  assert.deepEqual(orderStatusPill(order("READY_FOR_PICKUP"), NOW), { label: "Ready for pickup", tone: "success" });
  assert.deepEqual(orderStatusPill(order("CHEF_REJECTED"), NOW), { label: "Chef declined", tone: "accent" });
  assert.deepEqual(orderStatusPill(order("REFUNDED"), NOW), { label: "Refunded", tone: "muted" });
  assert.deepEqual(orderStatusPill(order("REFUND_FAILED"), NOW), { label: "Refund needs attention", tone: "accent" });
  assert.deepEqual(orderStatusPill(order("PAYMENT_PENDING", 45), NOW), { label: "Payment not completed", tone: "muted" });
});

test("track while cooking or on the way, reorder once delivered, else details", () => {
  assert.deepEqual(STATUSES.filter((status) => orderAction(status) === "TRACK"), ["PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"]);
  assert.equal(orderAction("DELIVERED"), "REORDER");
  assert.equal(orderAction("CHEF_ACCEPTED"), "DETAILS");
});

test("the payment row never claims a payment the order doesn't have", () => {
  assert.deepEqual(paymentStatus("DELIVERED"), { label: "Paid", tone: "success" });
  assert.deepEqual(paymentStatus("PAYMENT_PENDING"), { label: "Payment pending", tone: "warning" });
  assert.deepEqual(paymentStatus("PAYMENT_PENDING", { confirming: true }), { label: "Confirming payment", tone: "warning" });
  assert.deepEqual(paymentStatus("PAYMENT_PENDING", { abandoned: true }), { label: "Payment not completed", tone: "muted" });
  assert.deepEqual(paymentStatus("REFUNDED"), { label: "Refunded", tone: "success" });
  assert.deepEqual(paymentStatus("REFUND_FAILED"), { label: "Refund issue", tone: "accent" });
  assert.equal(paymentStatus("CHEF_REJECTED"), null);
  assert.equal(paymentStatus("CANCELLED"), null);
});

test("order dates read like the app", () => {
  const now = new Date("2026-10-11T18:00:00");
  assert.match(formatOrderDate("2026-10-11T12:42:00", now), /^Today, 12:42\spm$/u);
  assert.match(formatOrderDate("2026-10-10T09:05:00", now), /^Yesterday, 9:05\sam$/u);
  assert.match(formatOrderDate("2026-10-03T19:05:00", now), /^3 Oct, 7:05\spm$/u);
  assert.match(formatOrderDate("2025-12-31T19:05:00", now), /2025/);
  assert.equal(formatOrderDate("not a date", now), "");
});

test("the items line names each dish with its quantity", () => {
  assert.equal(orderItemsLine([{ itemName: "Veg thali", quantity: 2 }, { itemName: "Roti", quantity: 4 }]), "Veg thali × 2, Roti × 4");
  assert.equal(orderItemsLine([]), "Order items unavailable");
});
