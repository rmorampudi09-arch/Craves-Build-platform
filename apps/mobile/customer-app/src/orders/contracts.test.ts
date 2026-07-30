import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOrder, parseOrders } from './contracts.ts';

const order = {
  id: '11111111-1111-4111-8111-111111111111', checkoutId: '22222222-2222-4222-8222-222222222222', customerIdentityId: '33333333-3333-4333-8333-333333333333', kitchenId: '44444444-4444-4444-8444-444444444444', kitchenName: 'Annapurna', status: 'PREPARING', currency: 'INR', foodSubtotal: 180, platformFee: 5, taxAmount: 9, deliveryFee: 40, grandTotal: 234, chefResponseNote: null, prepTimeMinutes: 30, pickupAddress: { phone: 'private' }, items: [{ id: '55555555-5555-4555-8555-555555555555', menuItemId: '66666666-6666-4666-8666-666666666666', itemName: 'Meals', category: 'Lunch', foodType: 'VEG', unitPrice: 180, quantity: 1, lineTotal: 180 }], createdAt: '2026-07-30T00:00:00Z', updatedAt: '2026-07-30T00:01:00Z'
};

test('parses orders without identity or pickup information', () => {
  const parsed = parseOrder(order);
  assert.ok(parsed);
  assert.equal('customerIdentityId' in parsed, false);
  assert.equal('pickupAddress' in parsed, false);
});

test('parses bounded order list', () => {
  const parsed = parseOrders([order]);
  assert.equal(parsed?.length, 1);
  assert.equal(parseOrders(new Array(501).fill(order)), null);
});

test('rejects unknown commercial order status', () => {
  assert.equal(parseOrder({ ...order, status: 'UNKNOWN' }), null);
});
