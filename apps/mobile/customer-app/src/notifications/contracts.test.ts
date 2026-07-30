import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNotification, parseNotifications, unreadCount } from './contracts.ts';

const notice = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Order update',
  body: 'Your order is ready for pickup.',
  noticeType: 'ORDER_STATUS',
  targetType: 'ORDER',
  targetId: '22222222-2222-4222-8222-222222222222',
  readAt: null,
  createdAt: '2026-07-30T00:00:00Z',
  rawPayload: { provider: 'private' },
  eventKey: 'internal'
};

test('parses notification without internal payload', () => {
  const parsed = parseNotification(notice);
  assert.ok(parsed);
  assert.equal('rawPayload' in parsed, false);
  assert.equal('eventKey' in parsed, false);
});

test('counts unread notifications', () => {
  const parsed = parseNotifications([notice, { ...notice, id: '33333333-3333-4333-8333-333333333333', readAt: '2026-07-30T00:01:00Z' }]);
  assert.ok(parsed);
  assert.equal(unreadCount(parsed), 1);
});

test('rejects invalid target id', () => {
  assert.equal(parseNotification({ ...notice, targetId: 'bad' }), null);
});
