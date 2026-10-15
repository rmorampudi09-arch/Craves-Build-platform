import assert from "node:assert/strict";
import test from "node:test";
import { formatRelativeTime } from "./relative-time.ts";

test("relative time reads like the app", () => {
  const now = new Date(2026, 9, 15, 14, 0);
  const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 9, day, hour, minute).toISOString();
  assert.equal(formatRelativeTime(at(15, 13, 59), now), "1 min ago");
  assert.equal(formatRelativeTime(at(15, 14), now), "Just now");
  assert.equal(formatRelativeTime(at(15, 11, 30), now), "2 hr ago");
  assert.equal(formatRelativeTime(at(14, 23), now), "Yesterday");
  assert.equal(formatRelativeTime(at(2, 9), now), "2 Oct");
  assert.equal(formatRelativeTime("not a time", now), "");
});
