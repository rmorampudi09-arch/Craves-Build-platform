import assert from "node:assert/strict";
import test from "node:test";
import type { CustomerNotification } from "./notification-contract.ts";
import {
  chefNoticeCategory,
  chefNoticeHref,
  chefNoticeTime,
  markEachRead,
} from "./chef-notices.ts";

const ORDER = "44444444-4444-4444-8444-444444444444";
const notice = (
  noticeType: string,
  targetType: string | null = null,
  targetId: string | null = null,
): CustomerNotification => ({
  id: "55555555-5555-4555-8555-555555555555",
  title: "t",
  body: "b",
  noticeType,
  targetType,
  targetId,
  readAt: null,
  createdAt: "2026-10-15T08:00:00Z",
});

test("each notice falls in the app's category and opens its page", () => {
  const cases: [CustomerNotification, string, string | null][] = [
    [notice("CHEF_ORDER_AWAITING_ACCEPTANCE", "ORDER", ORDER), "orders", `/chef/orders/${ORDER}`],
    [notice("CHEF_ORDER_CANCELLED", "ORDER"), "orders", null],
    [notice("CHEF_PAYOUT_SENT", "PAYOUT"), "money", "/chef/earnings/payouts"],
    [notice("CHEF_SETTLEMENT_READY", "ORDER", ORDER), "money", "/chef/earnings/payouts"],
    [notice("CHEF_NEW_REVIEW", "ORDER", ORDER), "reviews", "/chef/reviews"],
    [notice("CHEF_SUBSCRIPTION_STARTED", "SUBSCRIPTION"), "plans", "/chef/meal-plans"],
    [notice("CHEF_APPLICATION_APPROVED", "CHEF_APPLICATION"), "other", "/chef/application/status"],
    [notice("ACCOUNT"), "other", null],
  ];
  for (const [item, category, href] of cases) {
    assert.equal(chefNoticeCategory(item), category, item.noticeType);
    assert.equal(chefNoticeHref(item), href, item.noticeType);
  }
});

test("times read like the app", () => {
  const now = new Date(2026, 9, 15, 14, 0);
  assert.equal(chefNoticeTime(new Date(2026, 9, 15, 13, 48).toISOString(), now), "12 min ago");
  assert.equal(chefNoticeTime(new Date(2026, 9, 15, 9, 5).toISOString(), now), "9:05 AM");
  assert.equal(chefNoticeTime(new Date(2026, 9, 15, 0, 30).toISOString(), now), "12:30 AM");
  assert.equal(chefNoticeTime(new Date(2026, 9, 14, 21, 0).toISOString(), now), "Yesterday");
});

test("marking read goes one notice at a time, at most six at once, and reports what worked", async () => {
  const ids = Array.from({ length: 9 }, (_, index) => `id-${index}`);
  let running = 0;
  let peak = 0;
  const marked = await markEachRead(ids, async (id) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 1));
    running -= 1;
    if (id === "id-3") throw new Error("failed");
  });
  assert.equal(peak, 6);
  assert.deepEqual(
    marked,
    ids.filter((id) => id !== "id-3"),
  );
  await assert.rejects(markEachRead(["a"], async () => Promise.reject(new Error("down"))));
  assert.deepEqual(await markEachRead([], async () => undefined), []);
});
