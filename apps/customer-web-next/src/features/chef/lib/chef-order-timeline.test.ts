import assert from "node:assert/strict";
import test from "node:test";
import type { ChefOrder } from "./chef-order-contract.ts";
import { chefOrderTimeline } from "./chef-order-timeline.ts";

// 06:32 UTC is 12:02 pm in India.
const base = { createdAt: "2026-10-26T06:32:00Z", updatedAt: "2026-10-26T06:34:00Z", prepTimeMinutes: 20, deliveryPartner: null } as const;
const steps = (order: Partial<ChefOrder> & Pick<ChefOrder, "status">, language?: "te") =>
  chefOrderTimeline({ ...base, ...order }, language).map((step) => [step.state, step.label, step.detail ?? ""].join(" | "));

test("a cooking order shows when it came in and when the chef accepted, with the promise", () => {
  assert.deepEqual(steps({ status: "PREPARING", statusHistory: [{ status: "CHEF_ACCEPTANCE_PENDING", at: "2026-10-26T06:32:30Z" }, { status: "CHEF_ACCEPTED", at: "2026-10-26T06:34:00Z" }] }), [
    "done | Order placed | 12:02 pm",
    "now | Cooking | 12:04 pm · ready in 20 min",
    "todo | Ready for pickup | ",
    "todo | On the way | ",
    "todo | Delivered | ",
  ]);
});

test("without history only the placed time and the current step's last change show", () => {
  assert.deepEqual(steps({ status: "OUT_FOR_DELIVERY", updatedAt: "2026-10-26T07:10:00Z", deliveryPartner: { name: "Ravi", phone: null, photoUrl: null, pickupEtaAt: null } }), [
    "done | Order placed | 12:02 pm",
    "done | You accepted | ready in 20 min",
    "done | Marked ready | ",
    "now | On the way | 12:40 pm",
    "todo | Delivered | ",
  ]);
  assert.deepEqual(steps({ status: "DELIVERED", prepTimeMinutes: null }).slice(2), ["done | Marked ready | ", "done | Picked up | ", "done | Delivered | 12:04 pm"]);
});

test("a rejected order stops at the chef's answer, in the chef's language", () => {
  assert.deepEqual(steps({ status: "CHEF_REJECTED", updatedAt: "2026-10-26T06:33:00Z" }), ["done | Order placed | 12:02 pm", "done | You rejected the order | 12:03 pm"]);
  assert.deepEqual(steps({ status: "REFUNDED" }, "te")[1], "done | ఆర్డర్ రద్దయింది | 12:04 pm");
});
