import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAddress, parseAddressInput, parseRecommendation } from './contracts.ts';

const input = { addressLabel: 'HOME', recipientName: 'Ravi Teja', contactPhoneNumber: '+919876543210', addressLine1: 'Plot 10', addressLine2: null, landmark: 'Near Park', areaName: 'Kukatpally', city: 'Hyderabad', state: 'Telangana', postalCode: '500072', latitude: 17.493, longitude: 78.399, isDefault: true };

test('validates mobile address input', () => {
  assert.deepEqual(parseAddressInput(input), input);
  assert.equal(parseAddressInput({ ...input, latitude: 100 }), null);
});

test('removes backend identity id from address response', () => {
  const parsed = parseAddress({ id: '11111111-1111-4111-8111-111111111111', identityId: '22222222-2222-4222-8222-222222222222', ...input, active: true, createdAt: '2026-07-30T00:00:00Z', updatedAt: '2026-07-30T00:00:00Z' });
  assert.ok(parsed);
  assert.equal('identityId' in parsed, false);
});

test('validates saved-address recommendation', () => {
  const parsed = parseRecommendation({ locationType: 'SAVED_ADDRESS', latitude: input.latitude, longitude: input.longitude, selectedSavedAddress: { id: '11111111-1111-4111-8111-111111111111', ...input, active: true, createdAt: '2026-07-30T00:00:00Z', updatedAt: '2026-07-30T00:00:00Z' }, distanceMeters: 20, matchRadiusMeters: 100 });
  assert.equal(parsed?.selectedSavedAddress?.addressLabel, 'HOME');
});
