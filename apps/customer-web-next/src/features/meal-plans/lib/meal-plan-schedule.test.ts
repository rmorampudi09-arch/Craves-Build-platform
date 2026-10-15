import assert from "node:assert/strict";
import test from "node:test";
import { mealsAndDays, mealSlotLabel, summarizeSchedule, type ScheduleItemLike } from "./meal-plan-schedule.ts";

const item = (over: Partial<ScheduleItemLike> = {}): ScheduleItemLike =>
  ({ menuItemId: "m1", foodType: "VEG", isoDayOfWeek: 1, dayOfMonth: null, mealSlotCode: "LUNCH", sequenceNumber: 1, ...over });
const weekdays = (days: number[]) => days.map((day, index) => item({ menuItemId: `m${day}`, isoDayOfWeek: day, sequenceNumber: index + 1 }));

test("an empty schedule summarizes to nothing", () => {
  assert.deepEqual(summarizeSchedule([]), { mealCount: 0, weekly: false, slotLabels: [], daysLabel: null, foodType: null, coverMenuItemId: null });
});

test("weekday lunches read as a range and repeat per week of the bill", () => {
  const summary = summarizeSchedule([...weekdays([1, 2, 3, 4, 5]), item({ menuItemId: "chicken", isoDayOfWeek: 3, foodType: "NON_VEG", sequenceNumber: 9 })]);
  assert.equal(summary.daysLabel, "Mon – Fri");
  assert.equal(summary.mealCount, 5);
  assert.equal(summary.foodType, "NON_VEG");
  assert.equal(mealsAndDays(summary, "week"), "5 meals · Mon – Fri");
  assert.equal(mealsAndDays(summary, "14 days"), "10 meals · Mon – Fri");
  assert.equal(mealsAndDays(summary, "28 days"), "20 meals · Mon – Fri");
});

test("days, diet and the cover dish follow the app", () => {
  assert.equal(summarizeSchedule(weekdays([1, 3, 5])).daysLabel, "Mon, Wed, Fri");
  assert.equal(summarizeSchedule(weekdays([1, 2, 3, 4, 5, 6, 7])).daysLabel, "Every day");
  // The week starts on Sunday, so Sunday's dish is the cover.
  assert.equal(summarizeSchedule(weekdays([2, 7])).coverMenuItemId, "m7");
  assert.equal(summarizeSchedule([item({ foodType: "EGG" }), item({ foodType: "VEG", isoDayOfWeek: 2 })]).foodType, "EGG");
  assert.equal(summarizeSchedule([item({ foodType: null })]).foodType, null);
  const monthly = summarizeSchedule([item({ isoDayOfWeek: null, dayOfMonth: 3 }), item({ isoDayOfWeek: null, dayOfMonth: 9, mealSlotCode: "LATE_NIGHT" })]);
  assert.deepEqual([monthly.weekly, monthly.daysLabel, monthly.slotLabels, mealsAndDays(monthly, "28 days")], [false, "2 days a month", ["Lunch", "Late Night"], "2 meals · 2 days a month"]);
  assert.equal(mealSlotLabel("BREAKFAST"), "Breakfast");
});
