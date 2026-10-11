import type {SubscriptionPayment} from '../domain/subscriptionPaymentTypes';
import {checkoutOutcome} from './useSubscriptionCheckout';

const SUBSCRIPTION_ID = '11111111-1111-4111-8111-111111111111';

function payment(status: SubscriptionPayment['status']): SubscriptionPayment {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    invoiceId: '22222222-2222-4222-8222-222222222222',
    subscriptionId: SUBSCRIPTION_ID,
    cycleStart: '2026-10-12',
    cycleEnd: '2026-10-19',
    amount: {amount: '1499', currency: 'INR'},
    status,
    provider: 'RAZORPAY',
    providerOrderId: 'order_abc123',
    providerPaymentId: null,
    checkoutKeyId: 'rzp_test_key',
    paymentSessionId: null,
    providerStatus: null,
    createdAt: '2026-10-11T10:00:00Z',
    updatedAt: '2026-10-11T10:00:00Z',
    paidAt: status === 'PAID' ? '2026-10-11T10:05:00Z' : null,
  };
}

describe('checkoutOutcome', () => {
  it('treats a PAID invoice as paid and carries the payment', () => {
    const paid = payment('PAID');
    expect(checkoutOutcome(paid, SUBSCRIPTION_ID)).toEqual({
      kind: 'paid',
      subscriptionId: SUBSCRIPTION_ID,
      payment: paid,
    });
  });

  it.each(['PAYMENT_REQUESTED', 'PAYMENT_PENDING'] as const)(
    'treats %s as still processing',
    status => {
      expect(checkoutOutcome(payment(status), SUBSCRIPTION_ID)).toEqual({
        kind: 'processing',
        subscriptionId: SUBSCRIPTION_ID,
      });
    },
  );

  it.each(['FAILED', 'CANCELLED'] as const)('treats %s as not completed', status => {
    expect(checkoutOutcome(payment(status), SUBSCRIPTION_ID)).toEqual({
      kind: 'not-completed',
      subscriptionId: SUBSCRIPTION_ID,
      message: 'Payment not completed. You can try again.',
    });
  });

  it('treats an unknown payment as not completed', () => {
    expect(checkoutOutcome(null, SUBSCRIPTION_ID)).toEqual({
      kind: 'not-completed',
      subscriptionId: SUBSCRIPTION_ID,
      message: 'Payment not completed. You can try again.',
    });
  });
});
