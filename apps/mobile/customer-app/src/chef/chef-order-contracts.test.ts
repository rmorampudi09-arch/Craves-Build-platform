import assert from 'node:assert/strict';
import test from 'node:test';
import { chefOrderAction, parseMobileChefOrder, parseMobileChefOrders } from './chef-order-contracts';

const order = {
  id: '11111111-2222-4333-8444-555555555555',
  customerIdentityId: 'private', checkoutId: 'private', kitchenId: 'private', pickupAddress: { addressLine1: 'private' },
  kitchenName: 'Home Kitchen', status: 'CHEF_ACCEPTANCE_PENDING', currency: 'INR', foodSubtotal: 250, grandTotal: 302,
  deliveryAddress: { recipientName: 'Customer', contactPhoneNumber: '+919999999999', addressLine1: 'Road', city: 'Hyderabad', state: 'Telangana', postalCode: '500001' },
  items: [{ id: '21111111-2222-4333-8444-555555555555', menuItemId: '31111111-2222-4333-8444-555555555555', itemName: 'Meal', quantity: 1, lineTotal: 250 }],
  createdAt: '2026-07-30T00:00:00Z', updatedAt: '2026-07-30T00:00:00Z'
};

test('keeps fulfillment fields and removes internal ownership fields', () => {
  const parsed = parseMobileChefOrder(order);
  assert.equal(parsed?.deliveryAddress?.contactPhoneNumber, '+919999999999');
  assert.equal('customerIdentityId' in (parsed ?? {}), false);
  assert.equal('checkoutId' in (parsed ?? {}), false);
  assert.equal('kitchenId' in (parsed ?? {}), false);
  assert.equal('pickupAddress' in (parsed ?? {}), false);
});

test('maps only supported chef actions', () => {
  assert.equal(chefOrderAction('CHEF_ACCEPTANCE_PENDING'), 'DECIDE');
  assert.equal(chefOrderAction('CHEF_ACCEPTED'), 'READY');
  assert.equal(chefOrderAction('DELIVERED'), 'NONE');
  assert.equal(chefOrderAction('REFUND_PENDING'), 'NONE');
});

test('rejects unknown status and malformed arrays', () => {
  assert.equal(parseMobileChefOrder({ ...order, status: 'AUTO_ACCEPTED' }), null);
  assert.equal(parseMobileChefOrders([order])?.length, 1);
  assert.equal(parseMobileChefOrders([order, { ...order, id: 'bad' }]), null);
});
