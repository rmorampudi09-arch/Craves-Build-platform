import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCheckout, parsePaymentSession, parsePaymentVerification, validCheckoutInput } from './contracts.ts';

const checkoutId = '11111111-1111-4111-8111-111111111111';
const paymentOrderId = '22222222-2222-4222-8222-222222222222';

test('parses backend checkout totals without private fields', () => {
  const parsed = parseCheckout({ id: checkoutId, customerIdentityId: '33333333-3333-4333-8333-333333333333', status: 'PAYMENT_PENDING', currency: 'INR', foodSubtotal: 180, platformFee: 5, taxAmount: 9, deliveryFee: 40, grandTotal: 234, deliveryAddressId: '44444444-4444-4444-8444-444444444444', orders: [{ id: '55555555-5555-4555-8555-555555555555', kitchenName: 'Annapurna', status: 'PAYMENT_PENDING', grandTotal: 234, pickupAddress: { private: true } }] });
  assert.ok(parsed);
  assert.equal(parsed.grandTotal, 234);
  assert.equal('customerIdentityId' in parsed, false);
  assert.equal('pickupAddress' in parsed.orders[0]!, false);
});

test('keeps only the SDK-required Cashfree order and session in ephemeral DTO', () => {
  const parsed = parsePaymentSession({ paymentOrderId, checkoutId, cashfreeOrderId: 'CRV_ORDER_123', cfOrderId: 'private-cf-id', paymentSessionId: 'session-token', amount: 234, currency: 'INR', status: 'PAYMENT_PENDING', customerIdentityId: 'private' });
  assert.ok(parsed);
  assert.equal(parsed.cashfreeOrderId, 'CRV_ORDER_123');
  assert.equal('cfOrderId' in parsed, false);
  assert.equal('customerIdentityId' in parsed, false);
});

test('validates backend verification and checkout input', () => {
  assert.deepEqual(parsePaymentVerification({ paymentOrderId, status: 'PAID', providerStatus: 'SUCCESS' }), { paymentOrderId, status: 'PAID' });
  assert.equal(parsePaymentVerification({ paymentOrderId, status: 'UNKNOWN' }), null);
  assert.equal(validCheckoutInput('44444444-4444-4444-8444-444444444444', 'Ring bell'), true);
  assert.equal(validCheckoutInput('bad', 'Ring bell'), false);
  assert.equal(validCheckoutInput('44444444-4444-4444-8444-444444444444', 'x'.repeat(501)), false);
});
