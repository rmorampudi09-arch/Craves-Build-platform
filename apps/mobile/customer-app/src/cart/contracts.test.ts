import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCart, validateMenuItemInput, validateQuantity } from './contracts.ts';

const item = { id: '11111111-1111-4111-8111-111111111111', menuItemId: '22222222-2222-4222-8222-222222222222', kitchenId: '33333333-3333-4333-8333-333333333333', itemName: 'Andhra Meals', kitchenName: 'Annapurna', unitPrice: 180, currency: 'INR', quantity: 2, lineTotal: 360, providerPayload: { secret: true } };

test('parses backend-owned cart totals and removes private fields', () => {
  const parsed = parseCart({ id: '44444444-4444-4444-8444-444444444444', customerIdentityId: '55555555-5555-4555-8555-555555555555', currency: 'INR', items: [item], totals: { foodSubtotal: 360, currency: 'INR' } });
  assert.ok(parsed);
  assert.equal(parsed.foodSubtotal, 360);
  assert.equal('customerIdentityId' in parsed, false);
  assert.equal('providerPayload' in parsed.items[0]!, false);
});

test('validates typed future discovery handoff', () => {
  assert.equal(validateMenuItemInput(item.menuItemId, 1), true);
  assert.equal(validateMenuItemInput('bad', 1), false);
  assert.equal(validateQuantity(100), true);
  assert.equal(validateQuantity(0), false);
});

test('rejects currency mismatch', () => {
  assert.equal(parseCart({ id: '44444444-4444-4444-8444-444444444444', currency: 'INR', items: [item], totals: { foodSubtotal: 360, currency: 'USD' } }), null);
});
