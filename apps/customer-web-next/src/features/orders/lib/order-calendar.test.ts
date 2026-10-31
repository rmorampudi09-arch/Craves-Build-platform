import assert from "node:assert/strict";
import test from "node:test";
import { cookName, orderCalendar } from "./order-calendar.ts";

const base = {
  kitchenName: "Lakshmi's Kitchen",
  createdAt: "2026-10-29T07:12:00Z",
  updatedAt: "2026-10-29T07:20:00Z",
  prepTimeMinutes: 30,
};

test("cooking: placed and accepted are done, cooking is now with its real time, the rest is still to come", () => {
  const sheet = orderCalendar({ ...base, status: "PREPARING" }, null);
  assert.ok(sheet);
  assert.deepEqual(sheet.rows.map((row) => row.state), ["done", "done", "now", "next", "next", "next"]);
  assert.equal(sheet.nowAfter, 2);
  assert.equal(sheet.rows[0].at, base.createdAt);
  assert.equal(sheet.rows[1].at, null, "no invented time for the acceptance");
  assert.equal(sheet.rows[2].at, base.updatedAt);
  assert.equal(sheet.rows[2].label, "Cooking now");
  assert.equal(sheet.rows[2].detail, "Lakshmi is cooking");
  assert.equal(sheet.rows[3].detail, "Ready in about 30 min");
  assert.equal(sheet.rows[5].detail, "still to come");
});

test("on the way: the pickup time comes from the delivery partner", () => {
  const sheet = orderCalendar(
    { ...base, status: "READY_FOR_PICKUP" },
    {
      status: "IN_TRANSIT",
      history: [
        { oldStatus: null, newStatus: "PICKED_UP", trackingUrl: null, observedAt: "2026-10-29T07:48:00Z", recordedAt: "2026-10-29T07:48:02Z" },
        { oldStatus: "PICKED_UP", newStatus: "IN_TRANSIT", trackingUrl: null, observedAt: "2026-10-29T07:50:00Z", recordedAt: "2026-10-29T07:50:01Z" },
      ],
    },
  );
  assert.ok(sheet);
  assert.equal(sheet.nowAfter, 4);
  assert.equal(sheet.rows[4].state, "now");
  assert.equal(sheet.rows[4].at, "2026-10-29T07:48:00Z");
});

test("delivered: every step done, no now-line; closed or unpaid orders get no sheet", () => {
  const sheet = orderCalendar({ ...base, status: "DELIVERED" }, null);
  assert.ok(sheet);
  assert.ok(sheet.rows.every((row) => row.state === "done"));
  assert.equal(sheet.nowAfter, null);
  assert.equal(orderCalendar({ ...base, status: "CANCELLED" }, null), null);
  assert.equal(orderCalendar({ ...base, status: "PAYMENT_PENDING" }, null), null);
});

test("waiting for the chef, and kitchens not named after a cook", () => {
  const sheet = orderCalendar({ ...base, status: "CHEF_ACCEPTANCE_PENDING" }, null);
  assert.equal(sheet?.rows[1].label, "Waiting for Lakshmi");
  assert.equal(cookName("Hyderabadi Dum House"), "The chef");
});
