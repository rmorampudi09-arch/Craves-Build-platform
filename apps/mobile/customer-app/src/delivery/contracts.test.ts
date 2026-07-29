import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliveryProgress,
  formatDeliveryStatus,
  isTerminalDeliveryStatus,
  parseDeliveryProjection,
  safeHttpsUrl
} from './contracts.ts';

const projection = {
  orderId: '11111111-2222-4333-8444-555555555555',
  deliveryJobId: '21111111-2222-4333-8444-555555555555',
  providerId: 'borzo',
  status: 'IN_TRANSIT',
  trackingUrl: 'https://tracking.example/order/1',
  observedAt: '2026-07-30T00:10:00Z',
  providerDeliveryId: 'private-provider-id',
  rawPayload: { secret: true },
  history: [{
    oldStatus: 'PICKED_UP',
    newStatus: 'IN_TRANSIT',
    trackingUrl: 'https://tracking.example/order/1',
    observedAt: '2026-07-30T00:10:00Z',
    recordedAt: '2026-07-30T00:10:01Z'
  }]
};

test('allow-lists mobile delivery fields', () => {
  const parsed = parseDeliveryProjection(projection);
  assert.equal(parsed?.status, 'IN_TRANSIT');
  assert.equal('providerDeliveryId' in (parsed ?? {}), false);
  assert.equal('rawPayload' in (parsed ?? {}), false);
});

test('rejects unsafe tracking links and invalid statuses', () => {
  assert.equal(safeHttpsUrl('http://tracking.example'), null);
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(parseDeliveryProjection({ ...projection, status: 'UNKNOWN_STATUS' }), null);
});

test('handles terminal states and progress', () => {
  assert.equal(isTerminalDeliveryStatus('DELIVERED'), true);
  assert.equal(isTerminalDeliveryStatus('IN_TRANSIT'), false);
  assert.equal(deliveryProgress('DELIVERED'), 100);
  assert.equal(formatDeliveryStatus('COURIER_TO_PICKUP'), 'Courier To Pickup');
});
