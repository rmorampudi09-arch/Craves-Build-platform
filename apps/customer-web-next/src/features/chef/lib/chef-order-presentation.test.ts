import assert from "node:assert/strict";
import test from "node:test";
import { acceptReadyMinutes, declineConsequence, notPickedUpCase, pickupEtaLabel, prepCountdown, respondCountdown, shortCustomerName } from "./chef-order-presentation.ts";

const createdAt = "2026-10-10T08:00:00Z";
const at = (iso: string) => Date.parse(iso);

test("counts down to the response deadline, red under five minutes, then says it passed", () => {
  const order = { createdAt, chefAcceptanceExpiresAt: "2026-10-10T08:15:00Z" };
  assert.deepEqual(respondCountdown(order, at("2026-10-10T08:00:00Z")), {
    label: "Respond in 15:00",
    tone: "success",
    fill: 1,
  });
  assert.deepEqual(respondCountdown(order, at("2026-10-10T08:07:30Z")), {
    label: "Respond in 7:30",
    tone: "warning",
    fill: 0.5,
  });
  assert.equal(respondCountdown(order, at("2026-10-10T08:10:00.001Z")).label, "Respond in 4:59");
  assert.equal(respondCountdown(order, at("2026-10-10T08:10:00.001Z")).tone, "danger");
  assert.deepEqual(respondCountdown(order, at("2026-10-10T08:15:00Z")), {
    label: "Time to respond has passed",
    tone: "danger",
    fill: null,
  });
  // A deadline before the order was placed has no bar.
  assert.equal(
    respondCountdown(
      { createdAt: "2026-10-10T08:20:00Z", chefAcceptanceExpiresAt: order.chefAcceptanceExpiresAt },
      at(createdAt),
    ).fill,
    null,
  );
});

test("decline wording follows the kind of order", () => {
  assert.equal(
    declineConsequence({ checkoutId: "21111111-2222-4333-8444-555555555555" }),
    "The customer is told right away and gets a full refund.",
  );
  assert.equal(
    declineConsequence({ checkoutId: null }),
    "The customer is told right away. This meal-plan day moves to the end of their plan.",
  );
});

test("a not-picked-up ticket names the order with a middle dot and carries the reason and note", () => {
  const id = "7f6392a6-1111-4222-8333-444444444444";
  assert.deepEqual(notPickedUpCase(id, "Partner left without the order", "  Waited 20 min  "), {
    contextRole: "CHEF",
    orderId: id,
    subject: "Not picked up · #7F6392A6",
    message: "Partner left without the order\n\nWaited 20 min",
  });
  assert.equal(notPickedUpCase(id, "Something else", " ").message, "Something else");
});

test("pickup time reads as minutes to go, then as due now", () => {
  const now = at("2026-10-10T08:00:00Z");
  assert.equal(pickupEtaLabel("2026-10-10T08:05:30Z", now), "Arriving in 6 min");
  assert.equal(pickupEtaLabel("2026-10-10T08:00:00Z", now), "Should be here now");
  assert.equal(pickupEtaLabel(null, now), null);
});

test("cooking counts down from acceptance and then counts minutes late", () => {
  const cooking = { status: "PREPARING" as const, prepTimeMinutes: 20, updatedAt: "2026-10-10T08:00:00Z" };
  assert.deepEqual(prepCountdown(cooking, at("2026-10-10T08:00:00Z")), { label: "Ready in 20 min", tone: "success", fill: 0, detail: "You promised 1:50 pm" });
  assert.deepEqual(prepCountdown(cooking, at("2026-10-10T08:12:01Z")), { label: "Ready in 8 min", tone: "success", fill: 721 / 1200, detail: "You promised 1:50 pm" });
  assert.equal(prepCountdown(cooking, at("2026-10-10T08:19:59Z"))?.label, "Ready in 1 min");
  assert.deepEqual(prepCountdown(cooking, at("2026-10-10T08:20:10Z")), { label: "1 min late", tone: "danger", fill: 1, detail: "You promised 1:50 pm" });
  assert.equal(prepCountdown(cooking, at("2026-10-10T08:25:00Z"))?.label, "5 min late");
  assert.equal(prepCountdown({ ...cooking, prepTimeMinutes: null }, at("2026-10-10T08:00:00Z")), null);
  assert.equal(prepCountdown({ ...cooking, status: "READY_FOR_PICKUP" }, at("2026-10-10T08:00:00Z")), null);
  // The order page knows when the chef accepted, even if the order changed since.
  assert.equal(prepCountdown({ ...cooking, updatedAt: "2026-10-10T08:15:00Z", statusHistory: [{ status: "CHEF_ACCEPTED", at: "2026-10-10T08:00:00Z" }] }, at("2026-10-10T08:12:01Z"))?.label, "Ready in 8 min");
});

test("countdowns, pickup times and decline wording speak the chef's language", () => {
  const order = { createdAt, chefAcceptanceExpiresAt: "2026-10-10T08:15:00Z" };
  assert.equal(respondCountdown(order, at(createdAt), "te").label, "15:00 లో జవాబు ఇవ్వండి");
  assert.equal(prepCountdown({ status: "PREPARING", prepTimeMinutes: 20, updatedAt: createdAt }, at("2026-10-10T08:25:00Z"), "kn")?.label, "5 ನಿಮಿ ತಡ");
  assert.equal(pickupEtaLabel("2026-10-10T08:05:30Z", at(createdAt), "kn"), "6 ನಿಮಿಷದಲ್ಲಿ ಬರುತ್ತಾರೆ");
  assert.notEqual(declineConsequence({ checkoutId: null }, "te"), declineConsequence({ checkoutId: null }));
});

test("one-tap accept promises the held time, else the slowest dish, else 15 minutes", () => {
  const item = (menuItemId: string, itemName: string) => ({ id: menuItemId, menuItemId, itemName, category: null, foodType: null, unitPrice: 100, quantity: 1, lineTotal: 100 });
  const dishes = [
    { id: "dish-a", itemName: "Biryani", preparationTimeMinutes: 40 },
    { id: "dish-b", itemName: "Raita", preparationTimeMinutes: null },
    { id: "dish-c", itemName: "Kheer", preparationTimeMinutes: 25 },
  ];
  assert.equal(acceptReadyMinutes({ prepTimeMinutes: 30, items: [item("dish-a", "Biryani")] }, dishes), 30);
  assert.equal(acceptReadyMinutes({ prepTimeMinutes: null, items: [item("dish-a", "Biryani"), item("dish-c", "Kheer")] }, dishes), 40);
  assert.equal(acceptReadyMinutes({ prepTimeMinutes: null, items: [item("gone", " kheer ")] }, dishes), 25);
  assert.equal(acceptReadyMinutes({ prepTimeMinutes: null, items: [item("dish-b", "Raita")] }, dishes), 15);
  assert.equal(acceptReadyMinutes({ prepTimeMinutes: null, items: [] }, dishes), 15);
  assert.equal(acceptReadyMinutes({ prepTimeMinutes: null, items: [item("dish-x", "Pot roast")] }, [{ id: "dish-x", itemName: "Pot roast", preparationTimeMinutes: 2_000 }]), 1_440);
});

test("an order card names the customer by first name and last initial only", () => {
  assert.equal(shortCustomerName("  Priya   Sharma "), "Priya S.");
  assert.equal(shortCustomerName("Ravi Kumar reddy"), "Ravi R.");
  assert.equal(shortCustomerName("Asha"), "Asha");
  assert.equal(shortCustomerName("  "), null);
  assert.equal(shortCustomerName(null), null);
});
