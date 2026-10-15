import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChefMealPlan,
  parseChefMealPlanInput,
  parseChefMealSchedule,
  parseChefMealScheduleInput,
  parseSubmitNote,
  planImageUrl,
} from "./chef-subscription-plan-contract.ts";

const PLAN_ID = "7f639200-0000-4000-8000-0000000000a1";
const DISH = "44444444-4444-4444-8444-444444444444";
const planFixture = {
  id: PLAN_ID,
  planCode: "PLAN_1",
  name: "Home lunch",
  description: "Fresh lunches",
  billingPeriod: "FORTNIGHTLY",
  amount: "1499.00",
  currency: "inr",
  status: "ACTIVE",
  reviewReason: null,
  submittedAt: null,
  reviewedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image?v=1760000000`,
  acceptingSubscribers: false,
  activeSubscriberCount: 8,
};
const scheduleFixture = {
  planId: PLAN_ID,
  recurrenceType: "WEEKLY",
  timezone: "Asia/Kolkata",
  serviceTime: null,
  generationLeadHours: 24,
  status: "DRAFT",
  version: 1,
  items: [
    {
      id: DISH,
      menuItemId: DISH,
      menuItemName: "Dal",
      menuItemCategory: null,
      menuItemFoodType: "VEG",
      menuItemPrice: 120,
      menuItemCurrency: "INR",
      quantity: 1,
      isoDayOfWeek: 1,
      dayOfMonth: null,
      mealSlotCode: "LUNCH",
      serviceTime: "12:30:00",
      sequenceNumber: 1,
    },
  ],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  activatedAt: null,
};

test("a plan reads 14-day bills, its photo through our route, the switch and the subscriber count", () => {
  assert.deepEqual(parseChefMealPlan(planFixture), {
    ...planFixture,
    amount: 1499,
    currency: "INR",
    imageUrl: `/api/chef/subscription-plans/${PLAN_ID}/image?v=1760000000`,
  });
  // Older backends send none of the three fields.
  const older: Record<string, unknown> = { ...planFixture };
  for (const key of ["imageUrl", "acceptingSubscribers", "activeSubscriberCount"]) delete older[key];
  assert.deepEqual(parseChefMealPlan(older), {
    ...parseChefMealPlan(planFixture),
    imageUrl: null,
    acceptingSubscribers: null,
    activeSubscriberCount: null,
  });
  assert.equal(parseChefMealPlan({ ...planFixture, billingPeriod: "DAILY" }), null);
  assert.equal(parseChefMealPlan({ ...planFixture, acceptingSubscribers: "yes" }), null);
  assert.equal(parseChefMealPlan({ ...planFixture, activeSubscriberCount: -1 }), null);
});

test("only our own image route or https photos are kept", () => {
  assert.equal(
    planImageUrl(`/api/chef/subscription-plans/${PLAN_ID}/image?v=1`),
    `/api/chef/subscription-plans/${PLAN_ID}/image?v=1`,
  );
  assert.equal(planImageUrl("https://cdn.craves.in/plan.jpg"), "https://cdn.craves.in/plan.jpg");
  for (const value of [
    "http://cdn.craves.in/plan.jpg",
    "javascript:alert(1)",
    "/api/v1/subscriptions/plans/not-a-uuid/image?v=1",
    `/api/v1/subscriptions/plans/${PLAN_ID}/image`,
    "//evil.example/x.jpg",
    42,
    null,
  ]) {
    assert.equal(planImageUrl(value), null, String(value));
  }
});

test("plan input: a name, a price above zero in rupees and paise, INR only", () => {
  const input = {
    name: " Home lunch ",
    description: "Fresh",
    billingPeriod: "FORTNIGHTLY",
    amount: 1499.5,
    currency: "INR",
  };
  assert.deepEqual(parseChefMealPlanInput(input), { ...input, name: "Home lunch" });
  for (const bad of [
    { amount: 0 },
    { amount: "1499" },
    { amount: 1.234 },
    { amount: 1_000_001 },
    { currency: "USD" },
    { billingPeriod: "DAILY" },
    { name: "x".repeat(161) },
    { description: "x".repeat(2001) },
  ]) {
    assert.equal(parseChefMealPlanInput({ ...input, ...bad }), null, JSON.stringify(bad));
  }
});

test("a schedule keeps dish names and allows no top-level time", () => {
  const schedule = parseChefMealSchedule(scheduleFixture);
  assert.equal(schedule?.items[0].menuItemName, "Dal");
  assert.equal(
    parseChefMealSchedule({
      ...scheduleFixture,
      items: [{ ...scheduleFixture.items[0], isoDayOfWeek: null, dayOfMonth: 3 }],
    }),
    null,
  );
  assert.equal(
    parseChefMealSchedule({
      ...scheduleFixture,
      recurrenceType: "MONTHLY",
      items: [{ ...scheduleFixture.items[0], isoDayOfWeek: null, dayOfMonth: 3 }],
    })?.items[0].dayOfMonth,
    3,
  );
});

test("schedule input is one week in India time, with HH:mm times", () => {
  const meal = {
    menuItemId: DISH,
    quantity: 2,
    isoDayOfWeek: 7,
    dayOfMonth: null,
    mealSlotCode: "LUNCH",
    serviceTime: "12:30",
    sequenceNumber: 1,
  };
  const input = {
    recurrenceType: "WEEKLY",
    timezone: "Asia/Kolkata",
    generationLeadHours: 24,
    items: [{ ...meal, extra: true }],
  };
  assert.deepEqual(parseChefMealScheduleInput(input), { ...input, items: [meal] });
  for (const bad of [
    { recurrenceType: "MONTHLY" },
    { timezone: "UTC" },
    { generationLeadHours: 169 },
    { items: [] },
    { items: [{ ...meal, dayOfMonth: 1 }] },
    { items: [{ ...meal, quantity: 101 }] },
    { items: [{ ...meal, serviceTime: "12:30:00" }] },
  ]) {
    assert.equal(parseChefMealScheduleInput({ ...input, ...bad }), null, JSON.stringify(bad));
  }
});

test("the submit note is optional and at most 1,000 characters", () => {
  assert.equal(parseSubmitNote(null), null);
  assert.equal(parseSubmitNote({ note: "  " }), null);
  assert.equal(parseSubmitNote({ note: " Thanks " }), "Thanks");
  assert.equal(parseSubmitNote({ note: "x".repeat(1001) }), undefined);
  assert.equal(parseSubmitNote({ note: 5 }), undefined);
  assert.equal(parseSubmitNote({ other: "x" }), undefined);
  assert.equal(parseSubmitNote(false), undefined);
});
