import assert from "node:assert/strict";
import test from "node:test";
import { declineConsequence, notPickedUpCase, pickupEtaLabel, respondCountdown } from "./chef-order-presentation.ts";

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
