import assert from "node:assert/strict";
import test from "node:test";
import { categoryCounts, noticeCategory, noticeHref } from "./customer-notices.ts";
import type { CustomerNotification } from "./notification-contract.ts";

const ID = "44444444-4444-4444-8444-444444444444";
const notice = (noticeType: string, targetType: string | null = null, targetId: string | null = null): CustomerNotification => ({
  id: "55555555-5555-4555-8555-555555555555", title: "Title", body: "Body", noticeType, targetType, targetId, readAt: null, createdAt: "2026-10-26T08:00:00Z",
});

test("chips sort notices the way the app does", () => {
  assert.equal(noticeCategory(notice("PAYMENT_SUCCEEDED", "ORDER")), "ORDERS");
  assert.equal(noticeCategory(notice("RIDER_ASSIGNED", "delivery")), "ORDERS");
  assert.equal(noticeCategory(notice("WEEKEND_PROMO")), "OFFERS");
  assert.equal(noticeCategory(notice("ANY", "COUPON")), "OFFERS");
  assert.equal(noticeCategory(notice("KITCHEN_LAUNCHED_NEARBY", "KITCHEN")), "UPDATES");
  assert.equal(noticeCategory(notice("ACCOUNT")), "UPDATES");
  // Like the app, an order word in the type alone doesn't make it an order notice.
  assert.equal(noticeCategory(notice("ORDER")), "OTHER");
  assert.deepEqual(categoryCounts([notice("A", "ORDER"), notice("PROMO"), notice("X"), notice("Y")]), { ALL: 4, ORDERS: 1, OFFERS: 1, UPDATES: 0, OTHER: 2 });
});

test("a tap opens the customer's order, its delivery or a kitchen, never a kitchen's own order", () => {
  assert.equal(noticeHref(notice("CHEF_ACCEPTED_ORDER", "ORDER", ID)), `/orders/${ID}`);
  assert.equal(noticeHref(notice("RIDER_ASSIGNED", "DELIVERY", ID)), `/orders/${ID}/tracking`);
  assert.equal(noticeHref(notice("KITCHEN_LAUNCHED_NEARBY", "KITCHEN", ID)), `/kitchen/${ID}`);
  assert.equal(noticeHref(notice("CHEF_ORDER_AWAITING_ACCEPTANCE", "ORDER", ID)), null);
  assert.equal(noticeHref(notice("ORDER_DELIVERED", "ORDER", null)), null);
  assert.equal(noticeHref(notice("PROMO", "OFFER", ID)), null);
});
