import assert from "node:assert/strict";
import test from "node:test";
import {
  capacityBar,
  capacityCaption,
  clampPlates,
  dateChangeLines,
  dayLabel,
  DEFAULT_SUBSCRIBER_PLATES,
  DEFAULT_TOTAL_PLATES,
  dishLimits,
  dishLimitSummary,
  firstServedSlot,
  limitDays,
  limitHeading,
  MAX_PLATES,
  setSubscriberPlates,
  setTotalPlates,
  slotLimits,
} from "./chef-daily-limits.ts";
import type {
  ChefCapacityDateOverride,
  ChefCapacityMenuDateOverride,
  ChefCapacityMenuRule,
  ChefCapacitySlotRule,
} from "./chef-subscription-capacity-contract.ts";
import type { ChefMealSchedule } from "./chef-subscription-plan-contract.ts";

const DISH_A = "44444444-4444-4444-8444-444444444444";
const DISH_B = "55555555-5555-4555-8555-555555555555";
const schedule = (
  days: number[],
  slot = "LUNCH",
  recurrenceType: "WEEKLY" | "MONTHLY" = "WEEKLY",
) =>
  ({
    recurrenceType,
    items: days.map((day) => ({
      isoDayOfWeek: recurrenceType === "WEEKLY" ? day : null,
      dayOfMonth: recurrenceType === "MONTHLY" ? day : null,
      mealSlotCode: slot,
    })),
  }) as unknown as ChefMealSchedule;
const slotRule = (fields: Partial<ChefCapacitySlotRule>) =>
  ({
    isoDayOfWeek: 1,
    mealSlotCode: "LUNCH",
    totalCapacityUnits: 30,
    subscriptionCapacityUnits: 12,
    salesEnabled: true,
    recurringReservedUnits: 5,
    recurringAvailableUnits: 7,
    recurringDeficitUnits: 0,
    ...fields,
  }) as ChefCapacitySlotRule;
const dishRule = (fields: Partial<ChefCapacityMenuRule>) =>
  ({
    isoDayOfWeek: 1,
    mealSlotCode: "LUNCH",
    menuItemId: DISH_A,
    maxSubscriptionUnits: 10,
    salesEnabled: true,
    ...fields,
  }) as ChefCapacityMenuRule;
const name = (id: string) => (id === DISH_A ? "Chicken curry" : "Lemon rice");

test("limits cover every weekday the plans serve that meal, else Monday to Friday", () => {
  assert.deepEqual(limitDays([schedule([3, 1, 2]), schedule([2, 5])], "LUNCH"), [1, 2, 3, 5]);
  assert.deepEqual(limitDays([schedule([1, 2], "DINNER")], "LUNCH"), [1, 2, 3, 4, 5]);
  assert.deepEqual(limitDays([], "LUNCH"), [1, 2, 3, 4, 5]);
  assert.deepEqual(limitDays([schedule([5, 12], "LUNCH", "MONTHLY")], "LUNCH"), [1, 2, 3, 4, 5]);
  assert.equal(firstServedSlot([schedule([1], "DINNER"), schedule([1], "SNACK")]), "SNACK");
  assert.equal(firstServedSlot([]), "LUNCH");
});

test("one meal at a time, in plain words", () => {
  assert.equal(limitHeading("LUNCH", [1, 2, 3, 4, 5]), "Every weekday lunch");
  assert.equal(limitHeading("DINNER", [1, 2, 3, 4, 5, 6, 7]), "Every dinner");
  assert.equal(limitHeading("LUNCH", [1, 3, 4]), "Lunch on Mon, Wed – Thu");
});

test("slot limits read the first day with a rule, start at 20 and 10, and flag days that differ", () => {
  const rules = [
    slotRule({ isoDayOfWeek: 3 }),
    slotRule({
      isoDayOfWeek: 2,
      totalCapacityUnits: 40,
      subscriptionCapacityUnits: 15,
      recurringReservedUnits: 9,
      recurringDeficitUnits: 2,
    }),
  ];
  assert.deepEqual(slotLimits(rules, "LUNCH", [1, 2, 3]), {
    total: 40,
    subscriber: 15,
    salesEnabled: true,
    booked: 9,
    deficit: 2,
    mixed: true,
  });
  assert.deepEqual(
    slotLimits(
      [slotRule({ mealSlotCode: "DINNER" }), slotRule({ isoDayOfWeek: 6 })],
      "LUNCH",
      [1, 2],
    ),
    {
      total: DEFAULT_TOTAL_PLATES,
      subscriber: DEFAULT_SUBSCRIBER_PLATES,
      salesEnabled: true,
      booked: 0,
      deficit: 0,
      mixed: false,
    },
  );
  const same = [slotRule({ isoDayOfWeek: 1 }), slotRule({ isoDayOfWeek: 2 })];
  assert.equal(slotLimits(same, "LUNCH", [1, 2, 3]).mixed, false);
  assert.equal(
    slotLimits([...same, slotRule({ isoDayOfWeek: 3, salesEnabled: false })], "LUNCH", [1, 2, 3])
      .mixed,
    true,
  );
  // Only the days a save would write count.
  assert.equal(
    slotLimits([...same, slotRule({ isoDayOfWeek: 6, totalCapacityUnits: 10 })], "LUNCH", [1, 2, 3])
      .mixed,
    false,
  );
  assert.equal(slotLimits([slotRule({ salesEnabled: false })], "LUNCH", [1]).salesEnabled, false);
});

test("dish limits read the first day with one, and are null while there is none", () => {
  const rules = [
    dishRule({ isoDayOfWeek: 2, maxSubscriptionUnits: 4 }),
    dishRule({ isoDayOfWeek: 1, maxSubscriptionUnits: 8 }),
    dishRule({ menuItemId: DISH_B }),
  ];
  assert.deepEqual(dishLimits(rules, DISH_A, "LUNCH", [1, 2]), {
    max: 8,
    salesEnabled: true,
    mixed: true,
  });
  assert.deepEqual(dishLimits(rules, DISH_A, "LUNCH", [1]), {
    max: 8,
    salesEnabled: true,
    mixed: false,
  });
  assert.equal(dishLimits([dishRule({ mealSlotCode: "DINNER" })], DISH_A, "LUNCH", [1]), null);
  assert.equal(dishLimitSummary([], "LUNCH", [1], name), "No limits set");
  assert.equal(dishLimitSummary([dishRule({})], "LUNCH", [1], name), "Chicken curry: max 10 a day");
  assert.equal(
    dishLimitSummary(
      [
        dishRule({}),
        dishRule({ isoDayOfWeek: 2 }),
        dishRule({ menuItemId: DISH_B, maxSubscriptionUnits: 5 }),
      ],
      "LUNCH",
      [1, 2],
      name,
    ),
    "Chicken curry: max 10 a day · +1 more",
  );
});

test("steppers keep plates whole, within the server's limit, and kept-for-subscribers never above the total", () => {
  assert.deepEqual([clampPlates(-4), clampPlates(12.6), clampPlates(999_999)], [0, 13, MAX_PLATES]);
  assert.deepEqual(setTotalPlates({ total: 20, subscriber: 10 }, 6), { total: 6, subscriber: 6 });
  assert.deepEqual(setTotalPlates({ total: 20, subscriber: 10 }, 25), {
    total: 25,
    subscriber: 10,
  });
  assert.deepEqual(setSubscriberPlates({ total: 20, subscriber: 10 }, 30), {
    total: 20,
    subscriber: 20,
  });
  assert.equal(setSubscriberPlates({ total: 20, subscriber: 5 }, -1).subscriber, 0);
});

test("the booked bar splits plates into booked, free and normal orders", () => {
  const bar = capacityBar({ total: 20, subscriber: 10 }, 8);
  assert.deepEqual(bar, { booked: 8, free: 2, normal: 10 });
  assert.equal(capacityCaption(bar), "8 subscriber plates booked · 2 free · 10 for normal orders");
  assert.deepEqual(capacityBar({ total: 20, subscriber: 4 }, 9), {
    booked: 4,
    free: 0,
    normal: 16,
  });
});

test("upcoming date changes for the meal, soonest first", () => {
  const today = "2026-10-13";
  const slotChange = (fields: Partial<ChefCapacityDateOverride>) =>
    ({
      serviceDate: "2026-10-25",
      mealSlotCode: "LUNCH",
      totalCapacityUnits: 15,
      subscriptionCapacityUnits: 5,
      closed: false,
      ...fields,
    }) as ChefCapacityDateOverride;
  const dishChange = (fields: Partial<ChefCapacityMenuDateOverride>) =>
    ({
      serviceDate: "2026-10-20",
      mealSlotCode: "LUNCH",
      menuItemId: DISH_A,
      maxSubscriptionUnits: 4,
      closed: false,
      ...fields,
    }) as ChefCapacityMenuDateOverride;
  assert.deepEqual(
    dateChangeLines(
      [slotChange({}), slotChange({ serviceDate: "2026-10-14", closed: true })],
      [dishChange({}), dishChange({ serviceDate: "2026-10-21", closed: true, menuItemId: DISH_B })],
      "LUNCH",
      today,
      name,
    ),
    [
      "Tomorrow · closed",
      "Tue 20 Oct · Chicken curry: max 4",
      "Wed 21 Oct · Lemon rice: closed",
      "Sun 25 Oct · 15 plates, 5 for subscribers",
    ],
  );
  assert.deepEqual(
    dateChangeLines(
      [slotChange({ mealSlotCode: "DINNER" }), slotChange({ serviceDate: "2026-10-01" })],
      [],
      "LUNCH",
      today,
      name,
    ),
    [],
  );
  assert.deepEqual(
    [
      dayLabel("2026-10-13", today),
      dayLabel("2026-10-12", today),
      dayLabel("2027-01-01", "2026-12-31"),
    ],
    ["Today", "Yesterday", "Tomorrow"],
  );
});
