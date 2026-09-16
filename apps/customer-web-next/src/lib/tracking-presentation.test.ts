import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseDeliveryStatusResponse } from './delivery-status.ts';
import { trackingPresentation } from './tracking-presentation.ts';

test('an existing delivery response with null status cannot hide ready-for-pickup progress', () => {
  const delivery = parseDeliveryStatusResponse({ orderId: '11111111-2222-4333-8444-555555555555',
    deliveryJobId: null, providerId: null, status: null, trackingUrl: null, observedAt: null, history: [] });
  const view = trackingPresentation('READY_FOR_PICKUP', delivery.status);
  assert.equal(view.label, 'Ready For Pickup');
  assert.match(view.description, /food is ready/i);
  assert.doesNotMatch(view.label, /waiting/i);
});

test('missing tracking retains known order states without inventing rider progress', () => {
  for (const status of ['PAYMENT_PENDING', 'PAID', 'CHEF_ACCEPTANCE_PENDING', 'CHEF_ACCEPTED', 'PREPARING',
    'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CHEF_REJECTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED']) {
    const view = trackingPresentation(status, null);
    assert.equal(view.label.toUpperCase().replaceAll(' ', '_'), status);
    assert.ok(view.description.length > 10);
    assert.doesNotMatch(view.description, /backend|projection|order service|delivery job/i);
  }
});

test('actual delivery progress is used when present', () => {
  assert.equal(trackingPresentation('READY_FOR_PICKUP', 'IN_TRANSIT').label, 'On the way');
  assert.equal(trackingPresentation('READY_FOR_PICKUP', 'DELIVERED').label, 'Delivered');
  assert.equal(trackingPresentation(null, null).label, 'Loading order');
});

test('tracking screen uses the tested null-safe presentation', () => {
  const page = readFileSync(new URL('../screens/OrderTracking/OrderTracking.tsx', import.meta.url), 'utf8');
  assert.match(page, /trackingPresentation\(order\?\.status \?\? null, delivery\?\.status \?\? null\)/);
  assert.match(page, /label=\{currentPresentation\.label\}/);
  assert.match(page, /desc=\{currentPresentation\.description\}/);
});
