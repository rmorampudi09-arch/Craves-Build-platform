import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscriptionOccurrence } from "./subscription-lifecycle-contract.ts";

const meal = {
  id: "11111111-1111-4111-8111-111111111111", serviceDate: "2026-10-12", mealSlotCode: "LUNCH", serviceAt: "2026-10-12T07:30:00Z",
  status: "ORDER_CREATED", items: [{ menuItemId: "22222222-2222-4222-8222-222222222222", quantity: 2, sequenceNumber: 1 }],
};

test("a meal keeps the order placed for it, for Track order", () => {
  const orderId = "33333333-3333-4333-8333-333333333333";
  assert.equal(parseSubscriptionOccurrence({ ...meal, orderId })?.orderId, orderId);
  assert.equal(parseSubscriptionOccurrence(meal)?.orderId, null);
  assert.equal(parseSubscriptionOccurrence({ ...meal, orderId: "not-an-order" }), null);
});
