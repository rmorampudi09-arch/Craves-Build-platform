import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FILTERS, historyQuery } from "./history-filters.ts";

test("all history has no date cutoff and starts on the newest page", () => {
  const query = historyQuery(DEFAULT_FILTERS);
  assert.equal(query.get("hours"), "0");
  assert.equal(query.get("sort"), "desc");
  assert.equal(query.get("offset"), "0");
  assert.equal(query.has("from"), false);
});

test("custom dates include the entire final IST day across a month boundary", () => {
  const query = historyQuery({ ...DEFAULT_FILTERS, range: "custom", from: "2024-02-29", through: "2024-02-29" });
  assert.equal(query.get("from"), "2024-02-28T18:30:00.000Z");
  assert.equal(query.get("to"), "2024-02-29T18:30:00.000Z");
});

test("invalid and reversed calendar dates cannot silently change the requested window", () => {
  for (const [from, through] of [["2025-02-29", "2025-03-01"], ["2024-03-02", "2024-03-01"], ["", "2024-03-01"]]) {
    assert.throws(() => historyQuery({ ...DEFAULT_FILTERS, range: "custom", from, through }));
  }
});

test("presets retain selected ordering and page size", () => {
  const query = historyQuery({ ...DEFAULT_FILTERS, range: "720", sort: "asc", limit: 100 });
  assert.equal(query.get("hours"), "720");
  assert.equal(query.get("sort"), "asc");
  assert.equal(query.get("limit"), "100");
});
