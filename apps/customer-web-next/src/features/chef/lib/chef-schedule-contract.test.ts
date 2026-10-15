import assert from "node:assert/strict";
import test from "node:test";
import {
  isServiceDate,
  parseChefKitchenSchedule,
  parseChefKitchenSettings,
  parseChefKitchenSettingsUpdate,
  parseChefOverrideUpdate,
  parseChefScheduleOverride,
  parseChefScheduleUpdate,
} from "./chef-schedule-contract.ts";

const KITCHEN = "6b1c0000-0000-4000-8000-000000000001";
const schedule = {
  kitchenId: KITCHEN,
  timezoneId: "Asia/Kolkata",
  acceptingOrders: true,
  pausedUntil: null,
  pauseReason: null,
  weeklyWindows: [
    {
      id: "6b1c0000-0000-4000-8000-0000000000a1",
      dayOfWeek: 1,
      opensAt: "11:00:00",
      closesAt: "23:59:00",
    },
  ],
};
const week = {
  acceptingOrders: true,
  pausedUntil: null,
  pauseReason: null,
  weeklyWindows: [{ dayOfWeek: 1, opensAt: "11:00", closesAt: "14:00" }],
};

test("reads the schedule in HH:MM, without the window ids", () => {
  assert.deepEqual(parseChefKitchenSchedule(schedule)?.weeklyWindows, [
    { dayOfWeek: 1, opensAt: "11:00", closesAt: "23:59" },
  ]);
  assert.equal(
    parseChefKitchenSchedule({
      ...schedule,
      pausedUntil: "2026-10-15T10:00:00Z",
      pauseReason: "Paused by chef",
    })?.pauseReason,
    "Paused by chef",
  );
  for (const bad of [
    { ...schedule, kitchenId: "nope" },
    { ...schedule, timezoneId: "Mars/Base" },
    { ...schedule, acceptingOrders: "yes" },
    { ...schedule, pausedUntil: "later" },
    { ...schedule, pauseReason: "r".repeat(161) },
    { ...schedule, weeklyWindows: [{ dayOfWeek: 8, opensAt: "11:00", closesAt: "12:00" }] },
    { ...schedule, weeklyWindows: [{ dayOfWeek: 1, opensAt: "24:00", closesAt: "12:00" }] },
    null,
    [],
  ])
    assert.equal(parseChefKitchenSchedule(bad), null);
});

test("reads a special day", () => {
  const override = {
    kitchenId: KITCHEN,
    serviceDate: "2026-10-20",
    closed: false,
    reason: "Diwali",
    windows: [{ id: "x", opensAt: "09:00:00", closesAt: "13:00:00" }],
  };
  assert.deepEqual(parseChefScheduleOverride(override), {
    serviceDate: "2026-10-20",
    closed: false,
    reason: "Diwali",
    windows: [{ opensAt: "09:00", closesAt: "13:00" }],
  });
  assert.equal(parseChefScheduleOverride({ ...override, serviceDate: "2026-02-30" }), null);
});

test("only real calendar days are service dates", () => {
  assert.ok(isServiceDate("2028-02-29"));
  for (const bad of ["2026-02-29", "2026-13-01", "2026-1-01", "20261001", "2026-10-01T00:00"])
    assert.ok(!isServiceDate(bad), bad);
});

test("a week update is checked the way the backend checks it", () => {
  assert.deepEqual(
    parseChefScheduleUpdate({
      ...week,
      pausedUntil: "2026-10-15T12:00:00.000Z",
      pauseReason: " Paused by chef ",
    }),
    {
      ...week,
      pausedUntil: "2026-10-15T12:00:00.000Z",
      pauseReason: "Paused by chef",
    },
  );
  assert.equal(parseChefScheduleUpdate({ ...week, pauseReason: "  " })?.pauseReason, null);
  const many = Array.from({ length: 57 }, (_, index) => ({
    dayOfWeek: (index % 7) + 1,
    opensAt: "11:00",
    closesAt: "12:00",
  }));
  for (const bad of [
    { ...week, acceptingOrders: null },
    { ...week, pausedUntil: "soon" },
    { ...week, pauseReason: "r".repeat(161) },
    { ...week, weeklyWindows: [{ dayOfWeek: 0, opensAt: "11:00", closesAt: "12:00" }] },
    { ...week, weeklyWindows: [{ dayOfWeek: 1, opensAt: "11:00:00", closesAt: "12:00" }] },
    { ...week, weeklyWindows: [{ dayOfWeek: 1, opensAt: "12:00", closesAt: "11:00" }] },
    {
      ...week,
      weeklyWindows: [
        { dayOfWeek: 1, opensAt: "11:00", closesAt: "14:00" },
        { dayOfWeek: 1, opensAt: "13:00", closesAt: "15:00" },
      ],
    },
    { ...week, weeklyWindows: [{ dayOfWeek: 1, opensAt: "11:00", closesAt: "14:00", id: "x" }] },
    { ...week, weeklyWindows: many },
    { ...week, extra: true },
    { ...week, weeklyWindows: undefined },
  ])
    assert.equal(parseChefScheduleUpdate(bad), null);
  // The same times on two days don't overlap.
  assert.ok(
    parseChefScheduleUpdate({
      ...week,
      weeklyWindows: [
        { dayOfWeek: 1, opensAt: "11:00", closesAt: "14:00" },
        { dayOfWeek: 2, opensAt: "11:00", closesAt: "14:00" },
      ],
    }),
  );
});

test("a special day is closed without times, or open with times", () => {
  assert.deepEqual(parseChefOverrideUpdate({ closed: true, reason: " Diwali ", windows: [] }), {
    closed: true,
    reason: "Diwali",
    windows: [],
  });
  assert.ok(
    parseChefOverrideUpdate({
      closed: false,
      reason: null,
      windows: [{ opensAt: "09:00", closesAt: "13:00" }],
    }),
  );
  for (const bad of [
    { closed: true, reason: null, windows: [{ opensAt: "09:00", closesAt: "13:00" }] },
    { closed: false, reason: null, windows: [] },
    {
      closed: false,
      reason: null,
      windows: [
        { opensAt: "09:00", closesAt: "13:00" },
        { opensAt: "12:00", closesAt: "14:00" },
      ],
    },
    { closed: true, reason: "r".repeat(161), windows: [] },
    { closed: true, windows: [] },
  ])
    assert.equal(parseChefOverrideUpdate(bad), null);
});

test("order settings: a cooking time of 5 to 120 minutes, or none", () => {
  assert.deepEqual(parseChefKitchenSettings({ autoAcceptOrders: true }), {
    autoAcceptOrders: true,
    defaultPrepMinutes: null,
  });
  assert.deepEqual(parseChefKitchenSettings({ autoAcceptOrders: false, defaultPrepMinutes: 20 }), {
    autoAcceptOrders: false,
    defaultPrepMinutes: 20,
  });
  assert.equal(parseChefKitchenSettings({ autoAcceptOrders: "true" }), null);
  assert.equal(parseChefKitchenSettings(null), null);
  assert.ok(parseChefKitchenSettingsUpdate({ autoAcceptOrders: true, defaultPrepMinutes: null }));
  for (const bad of [4, 121, 20.5, "20"])
    assert.equal(
      parseChefKitchenSettingsUpdate({ autoAcceptOrders: true, defaultPrepMinutes: bad }),
      null,
    );
  assert.equal(parseChefKitchenSettingsUpdate({ autoAcceptOrders: true }), null);
  assert.equal(
    parseChefKitchenSettingsUpdate({ autoAcceptOrders: true, defaultPrepMinutes: 20, extra: 1 }),
    null,
  );
});
