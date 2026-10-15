import assert from "node:assert/strict";
import test from "node:test";
import { getLiveOrder, LIVE_ORDER_STEPS } from "./live-order.ts";

// Synthetic orders, shaped like GET /api/orders.
const NOW = Date.parse("2026-10-15T13:00:00Z");
function order(id: string, status: string, createdAt = "2026-10-15T12:00:00Z") {
  return {
    id,
    checkoutId: "22222222-2222-4222-8222-222222222222",
    kitchenId: "44444444-4444-4444-8444-444444444444",
    kitchenName: "Relangi",
    status,
    currency: "INR",
    foodSubtotal: 40,
    platformFee: 5,
    taxAmount: 3.25,
    deliveryFee: 0,
    grandTotal: 48.25,
    chefResponseNote: null,
    prepTimeMinutes: 20,
    deliveryAddress: null,
    createdAt,
    updatedAt: createdAt,
    items: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        menuItemId: "66666666-6666-4666-8666-666666666666",
        itemName: "Dal",
        category: "Food",
        foodType: "VEG",
        unitPrice: 20,
        quantity: 2,
        lineTotal: 40,
      },
    ],
  };
}

test("ignores an order stuck in progress for over 12 hours", () => {
  assert.equal(getLiveOrder([order("a", "READY_FOR_PICKUP", "2026-10-14T23:00:00Z")], NOW), null);
  assert.equal(
    getLiveOrder([order("a", "READY_FOR_PICKUP", "2026-10-15T02:00:00Z")], NOW)?.orderId,
    "a",
  );
});

test("shows nothing until the chef accepts, and nothing once the order is done", () => {
  const statuses = [
    "PAYMENT_PENDING",
    "PAID",
    "CHEF_ACCEPTANCE_PENDING",
    "DELIVERED",
    "CHEF_REJECTED",
    "CANCELLED",
    "REFUND_PENDING",
    "REFUNDED",
    "REFUND_FAILED",
  ];
  assert.equal(
    getLiveOrder(
      statuses.map((status, i) => order(`id-${i}`, status)),
      NOW,
    ),
    null,
  );
  assert.equal(getLiveOrder([], NOW), null);
  assert.equal(getLiveOrder({ code: "ORDERS_UNAVAILABLE" }, NOW), null);
});

test("fills the four steps by status, with the order page's title", () => {
  const present = (status: string) => {
    const live = getLiveOrder([order("7f6392a6-1111-4111-8111-111111111111", status)], NOW);
    return live && [live.status, live.title, live.doneSteps];
  };
  assert.deepEqual(present("CHEF_ACCEPTED"), ["Accepted", "Chef accepted", 1]);
  assert.deepEqual(present("PREPARING"), ["Cooking", "Preparing your food", 1]);
  assert.deepEqual(present("READY_FOR_PICKUP"), ["Ready", "Ready for pickup", 2]);
  assert.deepEqual(present("OUT_FOR_DELIVERY"), ["On the way", "On the way", 3]);
  assert.equal(LIVE_ORDER_STEPS.length, 4);
});

test("picks the newest order in progress and labels it for the card", () => {
  const live = getLiveOrder(
    [
      order("aaaaaaaa-1111-4111-8111-111111111111", "PREPARING", "2026-10-15T10:00:00Z"),
      order("7f6392a6-1111-4111-8111-111111111111", "OUT_FOR_DELIVERY", "2026-10-15T11:00:00Z"),
      order("bbbbbbbb-1111-4111-8111-111111111111", "DELIVERED", "2026-10-15T12:00:00Z"),
      {
        ...order("cccccccc-1111-4111-8111-111111111111", "PREPARING", "2026-10-15T12:30:00Z"),
        items: "broken",
      },
    ],
    NOW,
  );
  assert.deepEqual(live, {
    orderId: "7f6392a6-1111-4111-8111-111111111111",
    kitchenName: "Relangi",
    status: "On the way",
    title: "On the way",
    reference: "Order #7F6392A6",
    doneSteps: 3,
    paid: "₹48.25",
    items: [
      { id: "55555555-5555-4555-8555-555555555555", itemName: "Dal", quantity: 2, price: "₹40" },
    ],
  });
});
