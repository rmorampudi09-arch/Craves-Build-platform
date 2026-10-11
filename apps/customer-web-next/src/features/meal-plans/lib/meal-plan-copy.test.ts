import assert from "node:assert/strict";
import test from "node:test";
import { changeDeadline, noticeLength, planDay } from "./meal-plan-copy.ts";
import type { SubscriptionOccurrence } from "./subscription-lifecycle-contract.ts";

const meal = (serviceDate: string, serviceAt: string, status: SubscriptionOccurrence["status"] = "READY_FOR_ORDER") =>
  ({ id: serviceAt, serviceDate, mealSlotCode: "LUNCH", serviceAt, status, items: [] }) as SubscriptionOccurrence;

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
