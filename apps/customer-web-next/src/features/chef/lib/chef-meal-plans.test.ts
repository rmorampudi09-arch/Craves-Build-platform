import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptingSubscribersValue,
  addMealLabel,
  addSlot,
  chefPlanCounts,
  chefPlanMetaLine,
  chefPlanPriceLabel,
  copyDayToWeekdays,
  dayRangeLabel,
  daysWithMeals,
  editorScheduleKind,
  filterChefPlans,
  formatServiceTime,
  freeSlotsForDay,
  groupMealDays,
  initialSlots,
  leadHoursLabel,
  otherWeekdaysHaveMeals,
  removeSlot,
  repeatsLabel,
  scheduleToSlots,
  setSlotDish,
  setSlotQuantity,
  setSlotTime,
  slotsToScheduleRequest,
  sortScheduleItems,
  stepWithErrors,
  subscriberCountLabel,
  TIME_OPTIONS,
  validateMealPlanForm,
  WEEK_ORDER,
  type EditorSlot,
} from "./chef-meal-plans.ts";
import { planPhotoCrop } from "./chef-plan-photo.ts";
import type { ChefMealSchedule } from "./chef-subscription-plan-contract.ts";

const DISH_A = "44444444-4444-4444-8444-444444444444";
const DISH_B = "55555555-5555-4555-8555-555555555555";
const slot = (fields: Partial<EditorSlot> & Pick<EditorSlot, "day" | "slot">): EditorSlot => ({
  key: `${fields.day}-${fields.slot}`,
  time: "12:30",
  menuItemId: DISH_A,
  quantity: 1,
  ...fields,
});
const item = (fields: Partial<ChefMealSchedule["items"][number]>) => ({
  id: "1",
  menuItemId: DISH_A,
  menuItemName: null,
  quantity: 1,
  isoDayOfWeek: null,
  dayOfMonth: null,
  mealSlotCode: "LUNCH",
  serviceTime: "12:30:00",
  sequenceNumber: 1,
  ...fields,
});
const validForm = { name: "Home Lunch", description: "Fresh lunches.", amount: "1499" };

test("a schedule request numbers each day's meals breakfast to dinner and sends one week", () => {
  const request = slotsToScheduleRequest(
    [
      slot({ day: 1, slot: "DINNER", time: "19:30", menuItemId: DISH_B }),
      slot({ day: 2, slot: "LUNCH" }),
      slot({ day: 1, slot: "LUNCH", quantity: 2 }),
    ],
    24,
  );
  assert.deepEqual(request, {
    recurrenceType: "WEEKLY",
    timezone: "Asia/Kolkata",
    generationLeadHours: 24,
    items: [
      {
        menuItemId: DISH_A,
        quantity: 2,
        isoDayOfWeek: 1,
        dayOfMonth: null,
        mealSlotCode: "LUNCH",
        serviceTime: "12:30",
        sequenceNumber: 1,
      },
      {
        menuItemId: DISH_B,
        quantity: 1,
        isoDayOfWeek: 1,
        dayOfMonth: null,
        mealSlotCode: "DINNER",
        serviceTime: "19:30",
        sequenceNumber: 2,
      },
      {
        menuItemId: DISH_A,
        quantity: 1,
        isoDayOfWeek: 2,
        dayOfMonth: null,
        mealSlotCode: "LUNCH",
        serviceTime: "12:30",
        sequenceNumber: 1,
      },
    ],
  });
  // Meals without a dish are left out.
  assert.deepEqual(
    slotsToScheduleRequest(
      [slot({ day: 1, slot: "LUNCH", menuItemId: null }), slot({ day: 1, slot: "DINNER" })],
      48,
    ).items.map((meal) => [meal.mealSlotCode, meal.sequenceNumber]),
    [["DINNER", 1]],
  );
});

test("a saved schedule round-trips, and old date-based ones read their dates", () => {
  const items = [
    item({ id: "1", isoDayOfWeek: 1 }),
    item({
      id: "2",
      menuItemId: DISH_B,
      quantity: 3,
      isoDayOfWeek: 1,
      mealSlotCode: "DINNER",
      serviceTime: "19:30:00",
      sequenceNumber: 2,
    }),
    item({ id: "3", isoDayOfWeek: 3, mealSlotCode: "BREAKFAST", serviceTime: "08:00:00" }),
    item({ id: "4", isoDayOfWeek: 4, mealSlotCode: "LATE_NIGHT" }),
  ];
  const slots = scheduleToSlots({ recurrenceType: "WEEKLY", items });
  assert.deepEqual(
    slots.map((meal) => [meal.day, meal.slot, meal.time]),
    [
      [1, "LUNCH", "12:30"],
      [1, "DINNER", "19:30"],
      [3, "BREAKFAST", "08:00"],
    ],
  );
  assert.deepEqual(
    slotsToScheduleRequest(slots, 12).items.map((meal) => meal.quantity),
    [1, 3, 1],
  );
  assert.deepEqual(
    scheduleToSlots({
      recurrenceType: "MONTHLY",
      items: [item({ dayOfMonth: 28, mealSlotCode: "SNACK" })],
    }),
    [{ key: "1", day: 28, slot: "SNACK", time: "12:30", menuItemId: DISH_A, quantity: 1 }],
  );
});

test("a live date-based plan keeps its dates; an editable one starts again as one week", () => {
  const monthly = { recurrenceType: "MONTHLY" as const, items: [item({ dayOfMonth: 5 })] };
  const weekly = { recurrenceType: "WEEKLY" as const, items: [item({ isoDayOfWeek: 7 })] };
  assert.equal(editorScheduleKind(false, monthly), "MONTHLY");
  assert.equal(initialSlots(false, monthly).length, 1);
  assert.equal(editorScheduleKind(true, monthly), "WEEKLY");
  assert.deepEqual(initialSlots(true, monthly), []);
  assert.equal(initialSlots(true, weekly).length, 1);
  assert.deepEqual(initialSlots(true, null), []);
});

test("slot edits: one time per meal, quantities 1-100, defaults and order", () => {
  const slots = [
    slot({ day: 1, slot: "LUNCH" }),
    slot({ day: 4, slot: "LUNCH" }),
    slot({ day: 1, slot: "DINNER", time: "19:30" }),
  ];
  assert.deepEqual(
    setSlotTime(slots, "LUNCH", "13:00").map((meal) => meal.time),
    ["13:00", "13:00", "19:30"],
  );
  assert.equal(setSlotQuantity(slots, "1-LUNCH", 0)[0].quantity, 1);
  assert.equal(setSlotQuantity(slots, "1-LUNCH", 101)[0].quantity, 100);
  assert.deepEqual(addSlot([slot({ day: 1, slot: "LUNCH", time: "13:30" })], 2, "LUNCH")[1], {
    key: "2-LUNCH",
    day: 2,
    slot: "LUNCH",
    time: "13:30",
    menuItemId: null,
    quantity: 1,
  });
  assert.equal(addSlot([], 1, "DINNER")[0].time, "19:30");
  assert.deepEqual(
    addSlot(addSlot([slot({ day: 1, slot: "DINNER" })], 1, "BREAKFAST"), 1, "DINNER").map(
      (meal) => meal.slot,
    ),
    ["BREAKFAST", "DINNER"],
  );
  assert.deepEqual(
    removeSlot(slots, "1-LUNCH").map((meal) => meal.key),
    ["4-LUNCH", "1-DINNER"],
  );
  assert.equal(setSlotDish(slots, "1-DINNER", DISH_B)[2].menuItemId, DISH_B);
  assert.deepEqual([...daysWithMeals(slots)], [1, 4]);
  assert.deepEqual(freeSlotsForDay(slots, 1), ["BREAKFAST", "SNACK"]);
});

test("validation: name, description and a price above zero; a dish for every meal on submit", () => {
  assert.deepEqual(validateMealPlanForm(validForm, [], "draft"), {});
  assert.deepEqual(
    Object.keys(
      validateMealPlanForm({ name: " ", description: "", amount: "0" }, [], "draft"),
    ).sort(),
    ["amount", "description", "name"],
  );
  assert.ok(validateMealPlanForm({ ...validForm, name: "x".repeat(161) }, [], "draft").name);
  assert.ok(
    validateMealPlanForm({ ...validForm, description: "x".repeat(501) }, [], "draft").description,
  );
  assert.ok(validateMealPlanForm({ ...validForm, amount: "abc" }, [], "draft").amount);
  assert.ok(validateMealPlanForm(validForm, [], "submit").schedule);
  const slots = [
    slot({ day: 1, slot: "LUNCH", menuItemId: null }),
    slot({ day: 1, slot: "DINNER" }),
  ];
  assert.deepEqual(validateMealPlanForm(validForm, slots, "submit"), {
    "slot:1-LUNCH": "Select a dish.",
  });
  assert.deepEqual(validateMealPlanForm(validForm, slots, "draft"), {});
  assert.equal(stepWithErrors({ name: "x", schedule: "x" }), 1);
  assert.equal(stepWithErrors({ "slot:1-LUNCH": "x" }), 2);
  assert.equal(stepWithErrors({}), null);
});

test("times every 30 minutes from 6 AM to 11:30 PM, and the lead-time choices", () => {
  assert.equal(TIME_OPTIONS.length, 36);
  assert.deepEqual(
    [TIME_OPTIONS[0], TIME_OPTIONS[1], TIME_OPTIONS[35]],
    ["06:00", "06:30", "23:30"],
  );
  assert.deepEqual(
    [
      formatServiceTime("08:30"),
      formatServiceTime("12:30:00"),
      formatServiceTime("00:00"),
      formatServiceTime("25:00"),
    ],
    ["8:30 AM", "12:30 PM", "12:00 AM", "25:00"],
  );
  assert.equal(leadHoursLabel(24), "24 hours before (default)");
  assert.equal(leadHoursLabel(1), "1 hour before");
});

test("copying a day fills Monday to Friday and leaves the weekend alone", () => {
  const tuesday = [
    slot({ day: 2, slot: "LUNCH", quantity: 2 }),
    slot({ day: 2, slot: "DINNER", time: "19:30", menuItemId: DISH_B }),
  ];
  const copied = copyDayToWeekdays(
    [
      ...tuesday,
      slot({ day: 3, slot: "SNACK" }),
      slot({ day: 6, slot: "LUNCH", menuItemId: DISH_B }),
    ],
    2,
  );
  for (const day of [1, 2, 3, 4, 5])
    assert.deepEqual(
      copied
        .filter((meal) => meal.day === day)
        .map((meal) => [meal.slot, meal.menuItemId, meal.quantity]),
      [
        ["LUNCH", DISH_A, 2],
        ["DINNER", DISH_B, 1],
      ],
    );
  assert.deepEqual(
    copied.filter((meal) => meal.day === 6).map((meal) => meal.menuItemId),
    [DISH_B],
  );
  assert.equal(new Set(copied.map((meal) => meal.key)).size, copied.length);
  assert.equal(otherWeekdaysHaveMeals(tuesday, 2), false);
  assert.equal(otherWeekdaysHaveMeals([...tuesday, slot({ day: 4, slot: "LUNCH" })], 2), true);
  assert.equal(otherWeekdaysHaveMeals([...tuesday, slot({ day: 7, slot: "LUNCH" })], 2), false);
});

test("review groups days with the same meals, Sunday first", () => {
  assert.deepEqual(WEEK_ORDER, [7, 1, 2, 3, 4, 5, 6]);
  const groups = groupMealDays([
    slot({ day: 1, slot: "LUNCH" }),
    slot({ day: 2, slot: "LUNCH" }),
    slot({ day: 3, slot: "LUNCH", menuItemId: DISH_B }),
    slot({ day: 4, slot: "LUNCH" }),
  ]);
  assert.deepEqual(
    groups.map((group) => group.days),
    [[1, 2, 4], [3]],
  );
  assert.equal(
    groupMealDays([
      slot({ day: 1, slot: "LUNCH" }),
      slot({ day: 2, slot: "LUNCH", quantity: 2 }),
      slot({ day: 3, slot: "LUNCH", time: "13:00" }),
    ]).length,
    3,
  );
  assert.deepEqual(
    groupMealDays([
      slot({ day: 1, slot: "LUNCH", menuItemId: DISH_B }),
      slot({ day: 7, slot: "LUNCH" }),
    ]).map((group) => group.days),
    [[7], [1]],
  );
});

test("day ranges, add-meal labels and how often a week repeats", () => {
  assert.equal(dayRangeLabel("WEEKLY", [3, 4, 5]), "Wed – Fri");
  assert.equal(dayRangeLabel("WEEKLY", [7, 1, 2]), "Sun – Tue");
  assert.equal(dayRangeLabel("WEEKLY", [6, 7]), "Sun, Sat");
  assert.equal(dayRangeLabel("WEEKLY", [1, 3, 4, 5, 7]), "Sun – Mon, Wed – Fri");
  assert.equal(dayRangeLabel("MONTHLY", [1, 2, 3, 15]), "Day 1 – 3, 15");
  assert.equal(addMealLabel(["BREAKFAST", "SNACK", "DINNER"]), "Add breakfast, snack or dinner");
  assert.equal(addMealLabel(["DINNER"]), "Add dinner");
  assert.equal(addMealLabel(["BREAKFAST", "LUNCH", "SNACK", "DINNER"]), "Add a meal");
  assert.equal(repeatsLabel("WEEKLY"), "Customers get this week each bill.");
  assert.equal(repeatsLabel("FORTNIGHTLY"), "This week repeats 2 times in each 14-day bill.");
  assert.equal(repeatsLabel("MONTHLY"), "This week repeats 4 times in each 28-day bill.");
});

test("plan list: filters, counts, meta line, price and the subscriber switch", () => {
  const plans = (["DRAFT", "REJECTED", "PENDING_APPROVAL", "ACTIVE", "INACTIVE"] as const).map(
    (status) => ({ status }),
  );
  assert.deepEqual(chefPlanCounts(plans), { ALL: 5, LIVE: 1, WAITING: 1, DRAFTS: 2 });
  assert.deepEqual(
    filterChefPlans(plans, "DRAFTS").map((plan) => plan.status),
    ["DRAFT", "REJECTED"],
  );
  assert.equal(chefPlanMetaLine("FORTNIGHTLY", undefined), "14 days");
  const week = [1, 2, 3, 4, 5].map((day) => item({ isoDayOfWeek: day }));
  assert.equal(
    chefPlanMetaLine("WEEKLY", [
      ...week,
      item({ isoDayOfWeek: 1, mealSlotCode: "DINNER", sequenceNumber: 2 }),
    ]),
    "Weekly · Lunch, Dinner · Mon – Fri",
  );
  assert.equal(
    chefPlanMetaLine("MONTHLY", [item({ isoDayOfWeek: 1 }), item({ isoDayOfWeek: 3 })]),
    "Monthly · Lunch · Mon, Wed",
  );
  assert.equal(
    chefPlanMetaLine(
      "MONTHLY",
      [1, 2, 3, 4, 5, 6, 7].map((day) => item({ isoDayOfWeek: day })),
    ),
    "Monthly · Lunch · every day",
  );
  assert.equal(
    chefPlanMetaLine("MONTHLY", [item({ dayOfMonth: 1 }), item({ dayOfMonth: 15 })]),
    "Monthly · Lunch · 2 days a month",
  );
  // The cover is the first meal served: Sunday's, then the day's first meal.
  assert.deepEqual(
    sortScheduleItems([
      item({ isoDayOfWeek: 1, menuItemId: DISH_A }),
      item({ isoDayOfWeek: 7, menuItemId: DISH_B, sequenceNumber: 2 }),
      item({ isoDayOfWeek: 7, menuItemId: DISH_A }),
    ]).map((meal) => [meal.isoDayOfWeek, meal.sequenceNumber]),
    [
      [7, 1],
      [7, 2],
      [1, 1],
    ],
  );
  assert.equal(
    chefPlanPriceLabel({ amount: 1499, currency: "INR", billingPeriod: "WEEKLY" }),
    "₹1,499 / week",
  );
  assert.equal(
    chefPlanPriceLabel({ amount: 12345.5, currency: "INR", billingPeriod: "MONTHLY" }),
    "₹12,345.50 / 28 days",
  );
  assert.equal(subscriberCountLabel(1), "1 subscriber");
  assert.equal(subscriberCountLabel(8), "8 subscribers");
  assert.equal(subscriberCountLabel(null), null);
  assert.equal(acceptingSubscribersValue({ status: "ACTIVE", acceptingSubscribers: false }), false);
  assert.equal(acceptingSubscribersValue({ status: "ACTIVE", acceptingSubscribers: null }), null);
  assert.equal(acceptingSubscribersValue({ status: "DRAFT", acceptingSubscribers: true }), null);
});

test("plan photos keep the middle 4:3 and are at most 1600 px wide", () => {
  assert.deepEqual(planPhotoCrop(4000, 3000), {
    sx: 0,
    sy: 0,
    sw: 4000,
    sh: 3000,
    width: 1600,
    height: 1200,
  });
  assert.deepEqual(planPhotoCrop(3000, 3000), {
    sx: 0,
    sy: 375,
    sw: 3000,
    sh: 2250,
    width: 1600,
    height: 1200,
  });
  assert.deepEqual(planPhotoCrop(1600, 600), {
    sx: 400,
    sy: 0,
    sw: 800,
    sh: 600,
    width: 800,
    height: 600,
  });
});
