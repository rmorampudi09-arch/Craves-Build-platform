import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMobileChefKitchen, parseMobileChefMenuItem, parseMobileChefMenuItems } from './kitchen-menu-contracts';

const kitchen = { id: '11111111-2222-4333-8444-555555555555', identityId: 'private', kitchenName: 'Home Kitchen', addressLine1: 'Road', city: 'Hyderabad', state: 'Telangana', status: 'ACTIVE' };
const item = { id: '21111111-2222-4333-8444-555555555555', kitchenId: 'private', itemName: 'Meal', category: 'Lunch', foodType: 'VEG', price: 250, currency: 'INR', unitPackageWeightGrams: 500, available: true, status: 'ACTIVE' };

test('removes kitchen ownership identifiers', () => {
  const parsed = parseMobileChefKitchen(kitchen);
  assert.equal(parsed?.kitchenName, 'Home Kitchen');
  assert.equal('identityId' in (parsed ?? {}), false);
});

test('validates menu values without storage metadata', () => {
  const parsed = parseMobileChefMenuItem({ ...item, images: [{ blobName: 'private' }] });
  assert.equal(parsed?.price, 250);
  assert.equal('kitchenId' in (parsed ?? {}), false);
  assert.equal('images' in (parsed ?? {}), false);
  assert.equal(parseMobileChefMenuItem({ ...item, price: 0 }), null);
});

test('validates complete menu arrays', () => {
  assert.equal(parseMobileChefMenuItems([item])?.length, 1);
  assert.equal(parseMobileChefMenuItems([item, { ...item, id: 'bad' }]), null);
});
