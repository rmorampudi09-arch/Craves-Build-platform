import assert from "node:assert/strict";
import test from "node:test";
import { changeDeadline, isPastSubscription, noticeLength, pauseDaysLine, pauseInfo, planDay, resumeDateFor } from "./meal-plan-copy.ts";
import type { SubscriptionOccurrence } from "./subscription-lifecycle-contract.ts";

const meal = (serviceDate: string, serviceAt: string, status: SubscriptionOccurrence["status"] = "READY_FOR_ORDER") =>
  ({ id: serviceAt, serviceDate, mealSlotCode: "LUNCH", serviceAt, status, items: [], orderId: null }) as SubscriptionOccurrence;

test("plan dates read like a calendar, not ISO", () => {
  assert.equal(planDay("2026-10-12"), "Mon 12 Oct");
});

test("cutoffs read as plain durations", () => {
  assert.equal(noticeLength(45), "45 minutes");
  assert.equal(noticeLength(720), "12 hours");
  assert.equal(noticeLength(60), "1 hour");
  assert.equal(noticeLength(1440), "1 day");
});

test("the change deadline names the next meal that can still change", () => {
  const now = new Date("2026-10-10T08:00:00Z"); // 1:30 pm in India, Sat 10 Oct
  const meals = [
    meal("2026-10-10", "2026-10-10T07:30:00Z"), // already past
    meal("2026-10-11", "2026-10-11T07:30:00Z", "ORDER_CREATED"), // too late to change
    meal("2026-10-12", "2026-10-12T07:30:00Z"),
  ];
  assert.equal(changeDeadline(meals, 720, now), "Changes for Mon 12 Oct close at 1:00 am on Mon 12 Oct.");
  assert.equal(
    changeDeadline([meal("2026-10-11", "2026-10-11T07:30:00Z")], 720, now),
    "Changes for tomorrow close at 1:00 am tomorrow.",
  );
  assert.equal(changeDeadline(meals, null, now), null);
  assert.equal(changeDeadline([], 60, now), null);
});

test("ended and cancelled plans are history", () => {
  assert.deepEqual(["EXPIRED", "CANCELLED", "ACTIVE", "PAUSED", "PENDING_PAYMENT"].map(status => isPastSubscription(status as "ACTIVE")), [true, true, false, false, false]);
});

test("resume picks the first day whose meal is more than the lead away (India time)", () => {
  const morning = new Date("2026-10-11T04:30:00Z"); // 10:00 am IST
  const afternoon = new Date("2026-10-11T07:30:00Z"); // 1:00 pm IST
  assert.equal(resumeDateFor(morning, 0, "12:30:00"), "2026-10-12");
  assert.equal(resumeDateFor(morning, 1440, "12:30:00"), "2026-10-12"); // 26.5 h away
  assert.equal(resumeDateFor(afternoon, 1440, "12:30:00"), "2026-10-13"); // tomorrow is 23.5 h away
  assert.equal(resumeDateFor(morning, 600, null), "2026-10-12");
  assert.equal(resumeDateFor(morning, 1440, null), "2026-10-13");
});

test("pause copy follows the bill's pause allowance", () => {
  const old = pauseInfo({ status: "ACTIVE", pauseDaysLeft: null, pauseAutoResumeDate: null }, "2026-10-20", "2026-10-19");
  assert.deepEqual(old, { pauseDisabledLabel: null, pauseMessage: "Upcoming meals stop until you resume the plan.", restartNote: null, resumeOffered: true, autoDate: null });
  assert.equal(pauseInfo({ status: "ACTIVE", pauseDaysLeft: 3, pauseAutoResumeDate: null }, "2026-10-20", "2026-10-19").pauseMessage,
    "You can pause up to 3 more days this bill. Your plan restarts by itself after that.");
  assert.equal(pauseInfo({ status: "ACTIVE", pauseDaysLeft: 1, pauseAutoResumeDate: null }, "2026-10-20", "2026-10-19").pauseMessage,
    "You can pause up to 1 more day this bill. Your plan restarts by itself after that.");
  assert.equal(pauseInfo({ status: "ACTIVE", pauseDaysLeft: 0, pauseAutoResumeDate: null }, "2026-10-20", "2026-10-19").pauseDisabledLabel, "No pause days left this bill");
});

test("a paused plan shows its restart and only offers an earlier resume", () => {
  const paused = { status: "PAUSED" as const, pauseDaysLeft: 0, pauseAutoResumeDate: "2026-10-27" };
  const same = pauseInfo(paused, "2026-10-27", "2026-10-25");
  assert.deepEqual([same.resumeOffered, same.restartNote, same.pauseDisabledLabel, same.autoDate], [false, "Restarts on Tue 27 Oct", null, "2026-10-27"]);
  assert.equal(pauseInfo(paused, "2026-10-24", "2026-10-23").resumeOffered, true);
  // An overdue restart never locks the customer in.
  const overdue = pauseInfo(paused, "2026-10-29", "2026-10-28");
  assert.deepEqual([overdue.resumeOffered, overdue.restartNote], [true, null]);
});

test("the pause days line shows only for running plans on a server that sends it", () => {
  assert.equal(pauseDaysLine({ status: "ACTIVE", pauseDaysLeft: 2 }), "2 pause days left this bill. Your plan restarts by itself after a pause.");
  assert.equal(pauseDaysLine({ status: "PAUSED", pauseDaysLeft: 0 }), "No pause days left this bill.");
  assert.equal(pauseDaysLine({ status: "ACTIVE", pauseDaysLeft: null }), null);
  assert.equal(pauseDaysLine({ status: "CANCELLED", pauseDaysLeft: 1 }), null);
});
