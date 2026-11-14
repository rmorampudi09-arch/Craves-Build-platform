import assert from "node:assert/strict";
import test from "node:test";
import { areaCounts, hidesRow, lastWeek, LOADING, riderState, todayFinding, todayRows, type AttentionData } from "./admin-attention.ts";

const NOW = Date.parse("2026-11-14T07:40:00Z"); // 1:10 pm IST
const ok = <T,>(value: T, more = false) => ({ state: "ok" as const, value, more });
const quiet: AttentionData = {
  ...LOADING, checkedAt: NOW,
  orders: ok({ statusCounts: [], orderTrend: [], recent: [], refundFailed: 0, readyForPickup: 0 }),
  refundsFailed: ok(0), readyForPickup: ok(0), deliveryProblems: ok(0), kitchens: ok(0), mealPlans: ok(0), chefHelp: ok(0), helpRequests: ok(0),
  riders: ok(0), selfies: ok(0), riderProblems: ok({ open: 0, late: 0 }), sos: ok([]), riderPay: ok(0),
  payouts: ok({ toConfirm: 0, failed: 0, onHold: 0 }), dispatch: ok("live" as const), rain: ok("off" as const),
};

test("nothing waiting folds into one line instead of a list of zeros", () => {
  const { rows, nothing } = todayRows(quiet, NOW);
  assert.equal(rows.length, 0);
  assert.ok(nothing.includes("failed refunds") && nothing.includes("help requests"));
});

test("an SOS in the last hour comes first; failed refunds before stuck orders; work before 'couldn't check'", () => {
  const data: AttentionData = { ...quiet, refundsFailed: ok(18), readyForPickup: ok(23), helpRequests: { state: "failed" },
    sos: ok([{ riderName: "Ravi K.", at: new Date(NOW - 4 * 60000).toISOString(), alerted: true }]) };
  const { rows } = todayRows(data, NOW);
  assert.deepEqual(rows.map(row => row.key), ["sos", "refunds", "ready", "Help requests"]);
  assert.match(rows[0].note, /Ravi K\. · 4 minutes ago · the alert email was sent/);
  assert.equal(rows[0].lead, "the SOS");
  assert.equal(rows[1].lead, "the 18 failed refunds");
  assert.equal(rows[3].count, null);
  assert.match(rows[3].label, /couldn't check/);
});

test("an older SOS stays on the SOS page, not on Today", () => {
  const data: AttentionData = { ...quiet, sos: ok([{ riderName: "Imran S.", at: new Date(NOW - 3 * 3600000).toISOString(), alerted: true }]) };
  assert.equal(todayRows(data, NOW).rows.length, 0);
});

test("hidden sources (no role, or the rider fleet switched off) are left out entirely", () => {
  const data: AttentionData = { ...quiet, riders: { state: "hidden" }, selfies: { state: "hidden" }, riderPay: { state: "hidden" } };
  const { rows, nothing } = todayRows(data, NOW);
  assert.equal(rows.length, 0);
  assert.ok(!nothing.includes("riders to approve"));
});

test("rider delivery state: practice run and heavy rain show on every page, off only on Today", () => {
  assert.equal(riderState(quiet), null);
  assert.equal(riderState({ ...quiet, dispatch: ok("shadow" as const) })?.everyPage, true);
  assert.equal(riderState({ ...quiet, rain: ok("severe" as const) })?.text, "Heavy rain mode is on");
  assert.equal(riderState({ ...quiet, dispatch: ok("off" as const) })?.everyPage, false);
});

test("menu badges add up each area's waiting work and mark urgent ones", () => {
  const counts = areaCounts({ ...quiet, refundsFailed: ok(2), deliveryProblems: ok(1), kitchens: ok(12), helpRequests: ok(9), payouts: ok({ toConfirm: 0, failed: 1, onHold: 0 }) }, NOW);
  assert.deepEqual(counts.orders, { count: 3, urgent: true });
  assert.deepEqual(counts.kitchens, { count: 12, urgent: false });
  assert.deepEqual(counts.inbox, { count: 9, urgent: false });
  assert.deepEqual(counts.finance, { count: 1, urgent: true });
  assert.equal(counts.riders, undefined);
});

test("the week chart is the last seven days, with today named", () => {
  const trend = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((date, count) => ({ date, count }));
  const week = lastWeek(trend, NOW);
  assert.equal(week.length, 7);
  assert.equal(week[6].label, "Today");
  assert.equal(week[0].label, "Sun");
  assert.equal(week[6].count, 8);
});

test("a row says how long its oldest item has waited, but not when only a first page was read", () => {
  const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
  const data: AttentionData = { ...quiet, helpRequests: { state: "ok", value: 9, oldest: daysAgo(36) }, chefHelp: { state: "ok", value: 2, more: true, oldest: daysAgo(12) } };
  const { rows } = todayRows(data, NOW);
  assert.match(rows.find(row => row.key === "help")!.note, /Reply, or add a private note\. Oldest: 36 days ago\.$/);
  assert.doesNotMatch(rows.find(row => row.key === "chef-help")!.note, /Oldest/);
});

test("a failed check is never summed up as nothing waiting, and a failed SOS check is a row of its own", () => {
  const failed = { state: "failed" } as const;
  const allFailed: AttentionData = { ...quiet, refundsFailed: failed, readyForPickup: failed, deliveryProblems: failed, kitchens: failed, mealPlans: failed, chefHelp: failed,
    helpRequests: failed, riders: failed, selfies: failed, riderProblems: failed, sos: failed, riderPay: failed, payouts: failed, dispatch: failed, rain: failed };
  const { rows } = todayRows(allFailed, NOW);
  assert.ok(rows.every(row => row.failed));
  assert.ok(rows.some(row => row.key === "sos" && /SOS presses: couldn't check/.test(row.label)));
  assert.ok(rows.some(row => row.key === "rider-mode"));
  assert.match(todayFinding(rows), /couldn't run/);
  assert.equal(todayFinding(todayRows(quiet, NOW).rows), "Nothing is waiting for you.");
});

test("an SOS whose alert email never went stays up for a day; Ready for pickup is not counted in the Orders badge", () => {
  const sos = [{ riderName: "Imran S.", at: new Date(NOW - 5 * 3600000).toISOString(), alerted: false }];
  assert.equal(todayRows({ ...quiet, sos: ok(sos) }, NOW).rows[0].key, "sos");
  assert.equal(todayRows({ ...quiet, sos: ok([{ ...sos[0], at: new Date(NOW - 25 * 3600000).toISOString() }]) }, NOW).rows.length, 0);
  assert.equal(areaCounts({ ...quiet, readyForPickup: ok(23) }, NOW).orders, undefined);
});

test("kitchen payouts on hold count, and rider pay is listed before kitchen payouts", () => {
  const { rows } = todayRows({ ...quiet, riderPay: ok(1), payouts: ok({ toConfirm: 0, failed: 0, onHold: 2 }) }, NOW);
  assert.deepEqual(rows.map(row => row.key), ["rider-pay", "payouts"]);
  assert.equal(rows[1].note, "2 kitchens on hold");
  assert.equal(todayRows({ ...quiet, payouts: ok({ toConfirm: 1, failed: 0, onHold: 0 }) }, NOW).rows[0].label, "kitchen payout needs a look");
});

test("a switched-off feature or a missing role leaves its row out; any other failure is couldn't check", () => {
  assert.equal(hidesRow("/api/admin/support/cases", 403, undefined), true);
  assert.equal(hidesRow("/api/admin/fleet/riders", 404, undefined), true);
  assert.equal(hidesRow("/api/admin/delivery-exceptions", 404, "DELIVERY_EXCEPTIONS_DISABLED"), true);
  assert.equal(hidesRow("/api/admin/support/cases", 404, "NOT_FOUND"), false);
  assert.equal(hidesRow("/api/admin/subscription-plans", 502, "INVALID_PLAN_RESPONSE"), false);
});
