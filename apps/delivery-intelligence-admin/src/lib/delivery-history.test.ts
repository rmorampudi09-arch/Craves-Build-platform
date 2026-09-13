import assert from "node:assert/strict";
import test from "node:test";
import { activityBuckets, DEFAULT_HISTORY_FILTERS, historyPage, historyQuery, type HistoryRequest } from "./delivery-history.ts";
import type { DeliveryOverview, HourlyActivity } from "./delivery-contract.ts";

const first: HistoryRequest = { filters: DEFAULT_HISTORY_FILTERS, activityOffset: 0, attentionOffset: 0 };
const page: DeliveryOverview = {
  generatedAt: "2026-09-13T08:00:00Z", windowHours: 0,
  windowStart: "2026-08-01T00:00:00Z", windowEnd: "2026-09-13T08:00:00Z",
  pageSize: 25, activityOffset: 0, attentionOffset: 0, activityHasMore: true, attentionHasMore: true,
  metrics: { commandCount: 70, completedCommandCount: 60, deliveryJobCount: 60, deliveredCount: 50, activeDeliveryCount: 10, recoveryCommandCount: 3, attentionCount: 40 },
  hourlyActivity: [], providerShare: [], recoveryHealth: { retriedCommandCount: 0, reconciliationCount: 0, providerWaitCount: 0, webhookDeadLetterCount: 0, trackingDeadLetterCount: 0 },
  recentActivity: [], attentionQueue: [],
};

test("default requests all persisted history with a bounded page, including records older than 30 days", () => {
  const query = new URLSearchParams(historyQuery(first));
  assert.equal(query.get("hours"), "0");
  assert.equal(query.get("limit"), "25");
  assert.equal(query.get("from"), null);
  assert.equal(query.get("sort"), "desc");
});

for (const range of ["24", "168", "720"] as const) test(`supports ${range}-hour filter and oldest-first ordering`, () => {
  const query = new URLSearchParams(historyQuery({ ...first, filters: { ...first.filters, range, sort: "asc" } }));
  assert.equal(query.get("hours"), range);
  assert.equal(query.get("sort"), "asc");
});

test("custom dates include both full IST days, independent of machine timezone", () => {
  const query = new URLSearchParams(historyQuery({ ...first, filters: { ...first.filters, range: "custom", from: "2026-09-08", to: "2026-09-08" } }));
  assert.equal(query.get("hours"), "0");
  assert.equal(query.get("from"), "2026-09-07T18:30:00.000Z");
  assert.equal(query.get("to"), "2026-09-08T18:30:00.000Z");
});

for (const [from, to] of [["", "2026-09-08"], ["2026-09-09", "2026-09-08"], ["2026-02-30", "2026-03-01"]]) {
  test(`rejects invalid calendar range ${from}/${to} before requesting data`, () => {
    assert.throws(() => historyQuery({ ...first, filters: { ...first.filters, range: "custom", from, to } }), /INVALID_DELIVERY_HISTORY_DATES/);
  });
}

test("older activity pages freeze the time window and preserve attention pagination", () => {
  const next = historyPage(first, page, "activity", 1);
  const query = new URLSearchParams(historyQuery(next));
  assert.equal(query.get("offset"), "25");
  assert.equal(query.get("attentionOffset"), "0");
  assert.equal(query.get("from"), page.windowStart);
  assert.equal(query.get("to"), page.windowEnd);
  const laterPage = { ...page, activityOffset: 25, windowEnd: "2026-09-13T09:00:00Z" };
  const attention = historyPage(next, laterPage, "attention", 1);
  assert.equal(attention.activityOffset, 25);
  assert.equal(attention.attentionOffset, 25);
  assert.equal(attention.snapshot?.to, page.windowEnd);
});

test("previous page stays in the same snapshot; last page cannot advance and offsets cannot become negative", () => {
  const next = historyPage(first, page, "activity", 1);
  const previous = historyPage(next, { ...page, activityOffset: 25 }, "activity", -1);
  assert.equal(previous.activityOffset, 0);
  assert.deepEqual(previous.snapshot, next.snapshot);
  assert.equal(historyPage(first, page, "activity", -1).activityOffset, 0);
  assert.equal(historyPage(next, { ...page, activityHasMore: false }, "activity", 1), next);
});

test("rejects unbounded or invalid pagination requests", () => {
  for (const limit of [0, 101, 25.5]) assert.throws(() => historyQuery({ ...first, filters: { ...first.filters, limit } }));
  for (const activityOffset of [-1, 0.1, 2_147_483_648]) assert.throws(() => historyQuery({ ...first, activityOffset }));
});

test("long-history chart preserves every event and both ends of the period within 48 rendered groups", () => {
  const points: HourlyActivity[] = Array.from({ length: 1000 }, (_, index) => ({
    bucketStart: new Date(Date.UTC(2026, 7, 1) + index * 3_600_000).toISOString(),
    commandCount: index === 0 ? 20 : 1, deliveryEventCount: 2, deliveredCount: 1,
  }));
  const result = activityBuckets([...points].reverse());
  assert.ok(result.length <= 48);
  assert.equal(result[0].bucketStart, points[0].bucketStart);
  assert.equal(result.at(-1)?.bucketEnd, points.at(-1)?.bucketStart);
  assert.equal(result.reduce((sum, point) => sum + point.commandCount, 0), 1019);
  assert.equal(result.reduce((sum, point) => sum + point.deliveryEventCount, 0), 2000);
  assert.equal(result.reduce((sum, point) => sum + point.deliveredCount, 0), 1000);
});

test("empty and short chart windows retain their actual data", () => {
  assert.deepEqual(activityBuckets([]), []);
  const point = { bucketStart: "2026-09-13T00:00:00Z", commandCount: 0, deliveryEventCount: 0, deliveredCount: 0 };
  assert.deepEqual(activityBuckets([point]), [{ ...point, bucketEnd: point.bucketStart }]);
});
