import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerNotification, parseCustomerNotifications, parseNotificationPage, parseUnreadCount } from "./notification-contract.ts";

const notice = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Delivery update",
  body: "Your order has been picked up.",
  noticeType: "DELIVERY_PICKED_UP",
  targetType: "ORDER",
  targetId: "21111111-2222-4333-8444-555555555555",
  readAt: null,
  createdAt: "2026-07-30T00:00:00Z",
  rawPayload: { providerDeliveryId: "private" },
  internalEventKey: "private"
};

test("allow-lists notification fields", () => {
  const parsed = parseCustomerNotification(notice);
  assert.equal(parsed?.title, notice.title);
  assert.equal("rawPayload" in (parsed ?? {}), false);
  assert.equal("internalEventKey" in (parsed ?? {}), false);
});

test("rejects invalid identifiers and timestamps", () => {
  assert.equal(parseCustomerNotification({ ...notice, id: "bad" }), null);
  assert.equal(parseCustomerNotification({ ...notice, createdAt: "not-a-date" }), null);
});

test("bounds inbox size", () => {
  assert.equal(parseCustomerNotifications([notice])?.length, 1);
  assert.equal(parseCustomerNotifications(Array.from({ length: 101 }, () => notice)), null);
});

test("reads a page of notices and the unread count, and rejects anything else", () => {
  assert.deepEqual(parseNotificationPage({ notices: [notice], nextCursor: "MjAyNi0x", hasMore: true })?.nextCursor, "MjAyNi0x");
  assert.equal(parseNotificationPage({ notices: [], nextCursor: null, hasMore: false })?.hasMore, false);
  for (const page of [null, [], { notices: [notice], nextCursor: null, hasMore: true }, { notices: [notice], nextCursor: "a=b", hasMore: true }, { notices: [{ ...notice, id: "bad" }], nextCursor: null, hasMore: false }, { notices: [], nextCursor: null }]) {
    assert.equal(parseNotificationPage(page), null);
  }
  assert.equal(parseUnreadCount({ unreadCount: 3 }), 3);
  for (const body of [null, {}, { unreadCount: -1 }, { unreadCount: 1.5 }, { unreadCount: "3" }]) assert.equal(parseUnreadCount(body), null);
});
