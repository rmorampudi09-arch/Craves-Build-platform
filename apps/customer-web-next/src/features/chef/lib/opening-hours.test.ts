import assert from "node:assert/strict";
import test from "node:test";
import {
  dayLabel,
  dayName,
  formatHoursTime,
  kitchenClock,
  kitchenOpenState,
  MIDNIGHT,
  pauseEnd,
  rangesForDay,
  summarizeRanges,
  timeOptions,
  upcomingDays,
  validateRanges,
  withDayRanges,
} from "./opening-hours.ts";

const IST = "Asia/Kolkata";
// Thursday 15 Oct 2026, 15:30 in India.
const now = new Date("2026-10-15T10:00:30Z");
const week = [
  { dayOfWeek: 4, opensAt: "18:00", closesAt: "22:00" },
  { dayOfWeek: 4, opensAt: "11:00", closesAt: "14:00" },
  { dayOfWeek: 5, opensAt: "11:00", closesAt: MIDNIGHT },
];
const schedule = { timezoneId: IST, acceptingOrders: true, pausedUntil: null, weeklyWindows: week };

test("times read like the app, with Midnight for 23:59", () => {
  assert.equal(formatHoursTime("00:30"), "12:30 AM");
  assert.equal(formatHoursTime("12:00"), "12:00 PM");
  assert.equal(formatHoursTime("22:00"), "10:00 PM");
  assert.equal(formatHoursTime(MIDNIGHT), "Midnight");
});

test("a day's ranges are sorted, and a day without any reads Closed only once the week has hours", () => {
  assert.deepEqual(rangesForDay(week, 4), [
    { opensAt: "11:00", closesAt: "14:00" },
    { opensAt: "18:00", closesAt: "22:00" },
  ]);
  assert.deepEqual(summarizeRanges(rangesForDay(week, 5), true), ["11:00 AM – Midnight"]);
  assert.deepEqual(summarizeRanges([], true), ["Closed"]);
  assert.deepEqual(summarizeRanges([], false), ["Not set"]);
});

test("ranges must close after they open and not overlap", () => {
  assert.equal(
    validateRanges([{ opensAt: "11:00", closesAt: "11:00" }]),
    "Each time must close after it opens.",
  );
  assert.equal(
    validateRanges([
      { opensAt: "18:00", closesAt: "22:00" },
      { opensAt: "11:00", closesAt: "18:30" },
    ]),
    "The two times overlap.",
  );
  assert.equal(
    validateRanges([
      { opensAt: "18:00", closesAt: "22:00" },
      { opensAt: "11:00", closesAt: "18:00" },
    ]),
    null,
  );
});

test("saving a day replaces it and the days it is copied to, leaving the rest", () => {
  const saved = withDayRanges(week, [4, 1], [{ opensAt: "09:00", closesAt: "12:00" }]);
  assert.deepEqual(rangesForDay(saved, 4), [{ opensAt: "09:00", closesAt: "12:00" }]);
  assert.deepEqual(rangesForDay(saved, 1), [{ opensAt: "09:00", closesAt: "12:00" }]);
  assert.deepEqual(rangesForDay(saved, 5), [{ opensAt: "11:00", closesAt: MIDNIGHT }]);
  assert.deepEqual(rangesForDay(withDayRanges(week, [4], []), 4), []);
});

test("times run from 5 AM to 11:30 PM in 30 minutes, closing can be Midnight, and saved odd times stay", () => {
  const opening = timeOptions([]);
  assert.equal(opening[0], "05:00");
  assert.equal(opening.at(-1), "23:30");
  assert.equal(opening.length, 38);
  assert.equal(timeOptions([], true).at(-1), MIDNIGHT);
  assert.ok(!timeOptions([MIDNIGHT]).includes(MIDNIGHT));
  assert.ok(timeOptions(["10:15"]).includes("10:15"));
});

test("the kitchen's clock and day labels follow its time zone, not the browser's", () => {
  assert.deepEqual(kitchenClock(now, IST), { date: "2026-10-15", day: 4, time: "15:30" });
  assert.deepEqual(kitchenClock(new Date("2026-10-18T18:45:00Z"), IST), {
    date: "2026-10-19",
    day: 1,
    time: "00:15",
  });
  assert.equal(dayLabel("2026-10-15", "2026-10-15"), "Today");
  assert.equal(dayLabel("2026-10-16", "2026-10-15"), "Tomorrow");
  assert.equal(dayLabel("2026-10-18", "2026-10-15"), "Sun 18 Oct");
  // In Telugu and Kannada the words change; times and the English month stay.
  assert.equal(dayLabel("2026-10-18", "2026-10-15", "te"), "ఆది 18 Oct");
  assert.equal(dayLabel("2026-10-19", "2026-10-15", "kn"), "ಸೋಮ 19 Oct");
  assert.equal(upcomingDays("2026-10-15", "te")[1].label, "రేపు");
  assert.equal(dayName(7, "kn"), "ಭಾನುವಾರ");
  assert.deepEqual(summarizeRanges(rangesForDay(week, 5), true, "kn"), ["11:00 AM – ಮಧ್ಯರಾತ್ರಿ"]);
  assert.equal(validateRanges([{ opensAt: "11:00", closesAt: "11:00" }], "te"), "ప్రతి సమయంలో, మూసే సమయం తెరిచే సమయం తర్వాత ఉండాలి.");
  assert.equal(kitchenOpenState("ACTIVE", { ...schedule, weeklyWindows: [{ dayOfWeek: 4, opensAt: "11:00", closesAt: MIDNIGHT }] }, now, null, "te").hoursToday, "11:00 AM – అర్ధరాత్రి");
  const days = upcomingDays("2026-12-30");
  assert.equal(days.length, 30);
  assert.deepEqual(
    days.slice(0, 3).map((day) => day.date),
    ["2026-12-30", "2026-12-31", "2027-01-01"],
  );
  assert.equal(days[2].label, "Fri 1 Jan");
});

test("a pause ends after its minutes, or at the kitchen's midnight for the rest of today", () => {
  assert.equal(pauseEnd(30, now, IST).toISOString(), "2026-10-15T10:30:30.000Z");
  assert.equal(pauseEnd(120, now, IST).toISOString(), "2026-10-15T12:00:30.000Z");
  assert.equal(pauseEnd("rest-of-day", now, IST).toISOString(), "2026-10-15T18:30:00.000Z");
});

test("the kitchen's state: Craves pause, chef closed, not taking orders, paused, outside hours, open", () => {
  assert.equal(kitchenOpenState("SUSPENDED", schedule, now).status, "suspended");
  assert.deepEqual(kitchenOpenState("INACTIVE", schedule, now).closedReason, "chef");
  const notTaking = kitchenOpenState("ACTIVE", { ...schedule, acceptingOrders: false }, now);
  assert.deepEqual(
    [notTaking.status, notTaking.closedReason, notTaking.takingOrders],
    ["closed", "not-accepting", false],
  );
  const paused = kitchenOpenState(
    "ACTIVE",
    { ...schedule, pausedUntil: "2026-10-15T11:00:00Z" },
    now,
  );
  assert.deepEqual(
    [paused.status, paused.backAt, paused.takingOrders],
    ["paused", "4:30 PM", true],
  );
  assert.equal(
    kitchenOpenState("ACTIVE", { ...schedule, pausedUntil: "2026-10-15T09:00:00Z" }, now).status,
    "closed",
  );
  const between = kitchenOpenState("ACTIVE", schedule, now);
  assert.deepEqual(
    [
      between.status,
      between.closedReason,
      between.opensAt,
      between.hoursToday,
      between.takingOrders,
    ],
    ["closed", "outside-hours", "6:00 PM", "11:00 AM – 2:00 PM, 6:00 PM – 10:00 PM", true],
  );
  assert.equal(
    kitchenOpenState("ACTIVE", schedule, new Date("2026-10-15T06:00:00Z")).status,
    "open",
  );
  // Friday closes at midnight: still open in its last minute.
  assert.equal(
    kitchenOpenState("ACTIVE", schedule, new Date("2026-10-16T18:29:30Z")).status,
    "open",
  );
});

test("today's special day goes before the week's hours, as the server decides", () => {
  const closedAllDay = { closed: true, windows: [] };
  const closed = kitchenOpenState("ACTIVE", schedule, now, closedAllDay);
  assert.deepEqual(
    [closed.status, closed.closedReason, closed.closedAllDay, closed.opensAt, closed.hoursToday],
    ["closed", "outside-hours", true, null, null],
  );
  assert.equal(closed.takingOrders, true);
  // 3:30 PM falls inside the special day's own hours, though the week has Thursday closed then.
  const open = kitchenOpenState("ACTIVE", schedule, now, {
    closed: false,
    windows: [{ opensAt: "15:00", closesAt: "17:00" }],
  });
  assert.deepEqual(
    [open.status, open.hoursToday, open.closedAllDay],
    ["open", "3:00 PM – 5:00 PM", false],
  );
  const later = kitchenOpenState("ACTIVE", schedule, now, {
    closed: false,
    windows: [
      { opensAt: "19:00", closesAt: "21:00" },
      { opensAt: "16:00", closesAt: "17:00" },
    ],
  });
  assert.deepEqual(
    [later.closedReason, later.opensAt, later.hoursToday],
    ["outside-hours", "4:00 PM", "4:00 PM – 5:00 PM, 7:00 PM – 9:00 PM"],
  );
  // A special day counts even when no weekly hours are set; not taking orders still comes first.
  assert.equal(
    kitchenOpenState("ACTIVE", { ...schedule, weeklyWindows: [] }, now, closedAllDay).status,
    "closed",
  );
  const notTaking = kitchenOpenState(
    "ACTIVE",
    { ...schedule, acceptingOrders: false },
    now,
    closedAllDay,
  );
  assert.deepEqual([notTaking.closedReason, notTaking.closedAllDay], ["not-accepting", false]);
});

test("no hours at all means open whenever the kitchen is; a day without hours in a set week is closed", () => {
  assert.equal(kitchenOpenState("ACTIVE", { ...schedule, weeklyWindows: [] }, now).status, "open");
  assert.equal(kitchenOpenState("ACTIVE", null, now).status, "open");
  const saturday = kitchenOpenState("ACTIVE", schedule, new Date("2026-10-17T06:00:00Z"));
  assert.deepEqual(
    [saturday.closedReason, saturday.opensAt, saturday.hoursToday],
    ["outside-hours", null, null],
  );
});
