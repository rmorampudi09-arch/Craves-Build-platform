import assert from "node:assert/strict";
import test from "node:test";
import type { ChefOrder } from "./chef-order-contract.ts";
import { groupPastOrders, inboxViewOf, pastGroupLabel, pastKindOf } from "./chef-order-filters.ts";

const order = (id: number, status: ChefOrder["status"], updatedAt: string, foodSubtotal = 100): ChefOrder => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, kitchenName: null, status, currency: "INR", foodSubtotal, platformFee: 0, taxAmount: 0,
  deliveryFee: 0, grandTotal: foodSubtotal, chefResponseNote: null, prepTimeMinutes: null, deliveryAddress: null, items: [], createdAt: updatedAt, updatedAt,
});

test("a picked-up order leaves Ready for Past; an unpaid one has no tab", () => {
  assert.equal(inboxViewOf("READY_FOR_PICKUP"), "READY");
  assert.equal(inboxViewOf("OUT_FOR_DELIVERY"), "PREVIOUS");
  assert.equal(inboxViewOf("PREPARING"), "IN_PROGRESS");
  assert.equal(inboxViewOf("PAYMENT_PENDING"), null);
  assert.deepEqual(
    (["DELIVERED", "OUT_FOR_DELIVERY", "CHEF_REJECTED", "CANCELLED", "REFUNDED"] as const).map(pastKindOf),
    ["DELIVERED", "ON_THE_WAY", "REJECTED", "CANCELLED", "CANCELLED"],
  );
});

test("past orders group by the India day they finished, with what was sold that day", () => {
  // 26 Oct 2026, 10:00 in India.
  const now = new Date("2026-10-26T04:30:00Z");
  const groups = groupPastOrders([
    order(1, "DELIVERED", "2026-10-26T03:00:00Z", 240.5),
    order(2, "CHEF_REJECTED", "2026-10-26T04:00:00Z", 500),
    order(3, "OUT_FOR_DELIVERY", "2026-10-25T20:00:00Z", 1000), // 01:30 on the 26th in India
    order(4, "DELIVERED", "2026-10-25T10:00:00Z", 180),
    order(5, "CANCELLED", "2026-10-13T10:00:00Z", 90),
  ]);
  assert.deepEqual(groups.map((group) => [group.key, group.orders.map((item) => Number(item.id.slice(-1)))]), [
    ["2026-10-26", [2, 1, 3]],
    ["2026-10-25", [4]],
    ["2026-10-13", [5]],
  ]);
  assert.deepEqual(groups.map((group) => pastGroupLabel(group, now)), ["Today · 3 orders · ₹1,241", "Yesterday · 1 order · ₹180", "13 Oct · 1 order"]);
  assert.equal(pastGroupLabel(groups[0]!, now, "te"), "ఈరోజు · 3 ఆర్డర్లు · ₹1,241");
  assert.equal(pastGroupLabel(groups[1]!, now, "kn"), "ನಿನ್ನೆ · 1 ಆರ್ಡರ್ · ₹180");
});
