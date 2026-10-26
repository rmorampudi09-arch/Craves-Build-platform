import assert from "node:assert/strict";
import test from "node:test";
import { parseChefScheduleAnswer, parseChefScheduleAnswerResult, parseChefScheduledOrderPage, scheduleWhen } from "./chef-scheduled-orders.ts";

// What order-service's ChefScheduledOrderView sends; the fields the screen doesn't use are dropped.
const view = {
  scheduleRequestId: "11111111-1111-4111-8111-111111111111", checkoutId: "22222222-2222-4222-8222-222222222222", orderId: "33333333-3333-4333-8333-333333333333",
  kitchenId: "44444444-4444-4444-8444-444444444444", requestedFulfilmentAt: "2026-10-27T07:30:00Z", requestedTimezone: "Asia/Kolkata", scheduleStatus: "PENDING_CHEF_CONFIRMATION",
  responseStatus: "PENDING", paymentGate: "PAYMENT_BEFORE_CHEF_CONFIRMATION", responseNote: null, responseVersion: 1, respondedAt: null, createdAt: "2026-10-26T07:30:00Z",
};

test("a page keeps what the screen needs and wants a cursor when there is more", () => {
  assert.deepEqual(parseChefScheduledOrderPage({ items: [view], nextCursor: "abc_-9", hasMore: true }), {
    items: [{ scheduleRequestId: view.scheduleRequestId, orderId: view.orderId, requestedFulfilmentAt: view.requestedFulfilmentAt, responseStatus: "PENDING", paymentGate: "PAYMENT_BEFORE_CHEF_CONFIRMATION", responseVersion: 1 }],
    nextCursor: "abc_-9",
    hasMore: true,
  });
  for (const bad of [{ ...view, responseStatus: "MAYBE" }, { ...view, paymentGate: "LATER" }, { ...view, responseVersion: 0 }, { ...view, orderId: "order" }, { ...view, requestedFulfilmentAt: "soon" }]) {
    assert.equal(parseChefScheduledOrderPage({ items: [bad], nextCursor: null, hasMore: false }), null, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(parseChefScheduledOrderPage({ items: [view], nextCursor: null, hasMore: true }), null);
});

test("an answer is ACCEPT or REJECT with a version and a short note", () => {
  assert.deepEqual(parseChefScheduleAnswer({ action: "REJECT", responseNote: "  Busy then ", expectedVersion: 2 }), { action: "REJECT", responseNote: "Busy then", expectedVersion: 2 });
  assert.deepEqual(parseChefScheduleAnswer({ action: "ACCEPT", responseNote: null, expectedVersion: 1 }), { action: "ACCEPT", responseNote: null, expectedVersion: 1 });
  for (const bad of [{ action: "MAYBE", expectedVersion: 1 }, { action: "ACCEPT", expectedVersion: 0 }, { action: "REJECT", responseNote: "x".repeat(501), expectedVersion: 1 }, { action: "REJECT", responseNote: 5, expectedVersion: 1 }]) {
    assert.equal(parseChefScheduleAnswer(bad), null, JSON.stringify(bad).slice(0, 60));
  }
  assert.deepEqual(parseChefScheduleAnswerResult({ orderId: view.orderId, kitchenId: view.kitchenId, status: "ACCEPTED", version: 2 }), { orderId: view.orderId, status: "ACCEPTED" });
  assert.equal(parseChefScheduleAnswerResult({ orderId: view.orderId, status: "ACCEPTED" }), null);
});

test("the time reads as today, tomorrow or a date, in India time", () => {
  const now = new Date("2026-10-26T04:30:00Z"); // 10:00 am, 26 Oct in India
  assert.equal(scheduleWhen("2026-10-26T13:00:00Z", now), "Today, 6:30 pm");
  assert.equal(scheduleWhen("2026-10-27T07:30:00Z", now), "Tomorrow, 1:00 pm");
  assert.equal(scheduleWhen("2026-10-27T07:30:00Z", now, "te"), "రేపు, 1:00 pm");
  assert.equal(scheduleWhen("2026-10-31T07:00:00Z", now), "Sat, 31 Oct, 12:30 pm");
});
