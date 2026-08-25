import assert from "node:assert/strict";
import test from "node:test";
import { parseOrderTrackingTimeline } from "./realtime-order-tracking-contract.ts";

const payload = {
  orderId: "11111111-2222-4333-8444-555555555555",
  currentStatus: "PREPARING",
  createdAt: "2026-08-25T10:00:00Z",
  updatedAt: "2026-08-25T10:15:00Z",
  events: [{ id: "21111111-2222-4333-8444-555555555555", status: "PREPARING", occurredAt: "2026-08-25T10:15:00Z" }],
};

test("accepts a bounded allow-listed tracking response", () => {
  assert.equal(parseOrderTrackingTimeline(payload)?.currentStatus, "PREPARING");
});

test("rejects unknown statuses and invalid identifiers", () => {
  assert.equal(parseOrderTrackingTimeline({ ...payload, currentStatus: "INTERNAL_PROVIDER_STATE" }), null);
  assert.equal(parseOrderTrackingTimeline({ ...payload, orderId: "bad" }), null);
});
