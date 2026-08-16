import type {CheckoutSession} from '../checkout/domain/checkoutTypes';
import {
  parsePaymentOrderHandoffSession,
  parsePaymentOrderSnapshot,
} from './api/paymentApi';
import {
  createPaymentHandoffCoordinator,
  paymentHandoffCapability,
  prepareRazorpayHostedHandoff,
} from './domain/paymentHandoffCoordinator';
import type {PaymentOrderHandoffSession} from './domain/paymentTypes';

const checkout: CheckoutSession = {
  checkoutId: '11111111-1111-4111-8111-111111111111',
  customerIdentityId: '22222222-2222-4222-8222-222222222222',
  status: 'PAYMENT_PENDING',
  currency: 'INR',
  foodSubtotal: {amount: '100.00', currency: 'INR'},
  platformFee: {amount: '5.00', currency: 'INR'},
  taxAmount: {amount: '5.00', currency: 'INR'},
  deliveryFee: {amount: '20.00', currency: 'INR'},
  grandTotal: {amount: '130.00', currency: 'INR'},
  chargePolicyId: '33333333-3333-4333-8333-333333333333',
  deliveryAddressId: '44444444-4444-4444-8444-444444444444',
  orders: [],
  createdAt: '2026-08-16T10:00:00Z',
};

const paymentOrder: PaymentOrderHandoffSession = {
  paymentOrderId: '55555555-5555-4555-8555-555555555555',
  checkoutId: checkout.checkoutId,
  cravesPaymentOrderRef: 'CRV_55555555555545558555555555555555',
  provider: 'RAZORPAY',
  providerOrderId: 'order_Razorpay123',
  providerPaymentId: null,
  checkoutKeyId: 'rzp_test_public_key',
  paymentSessionId: null,
  amount: {amount: '130.0', currency: 'INR'},
  status: 'PAYMENT_PENDING',
  createdAt: '2026-08-16T10:01:00Z',
};

describe('production Razorpay payment eligibility and provider handoff', () => {
  it('parses the current provider-neutral create-payment response', () => {
    expect(
      parsePaymentOrderHandoffSession({
        ...paymentOrder,
        amount: 130,
        currency: 'INR',
        amountObjectThatMustNotBeTrusted: paymentOrder.amount,
      }),
    ).toEqual({...paymentOrder, amount: {amount: '130', currency: 'INR'}});
  });

  it('rejects a Razorpay create response without its public checkout key', () => {
    expect(
      parsePaymentOrderHandoffSession({
        ...paymentOrder,
        checkoutKeyId: null,
        amount: 130,
        currency: 'INR',
      }),
    ).toBeNull();
  });

  it('parses the owned read model without exposing provider checkout credentials', () => {
    const snapshot = parsePaymentOrderSnapshot({
      paymentOrderId: paymentOrder.paymentOrderId,
      checkoutId: paymentOrder.checkoutId,
      customerIdentityId: checkout.customerIdentityId,
      cravesPaymentOrderRef: paymentOrder.cravesPaymentOrderRef,
      provider: 'RAZORPAY',
      providerOrderId: paymentOrder.providerOrderId,
      providerPaymentId: null,
      amount: '130.00',
      currency: 'INR',
      status: 'PAYMENT_PENDING',
      providerStatus: 'created',
      createdAt: paymentOrder.createdAt,
      updatedAt: paymentOrder.createdAt,
    });

    expect(snapshot?.amount).toEqual({amount: '130.00', currency: 'INR'});
    expect(snapshot).not.toHaveProperty('checkoutKeyId');
    expect(snapshot).not.toHaveProperty('paymentSessionId');
  });

  it('cross-checks checkout identity and authoritative amount before handoff', () => {
    expect(prepareRazorpayHostedHandoff(checkout, paymentOrder)).toMatchObject({
      provider: 'RAZORPAY',
      checkoutId: checkout.checkoutId,
      paymentOrderId: paymentOrder.paymentOrderId,
      providerOrderId: paymentOrder.providerOrderId,
      amount: {amount: '130.0', currency: 'INR'},
    });

    expect(() =>
      prepareRazorpayHostedHandoff(checkout, {
        ...paymentOrder,
        amount: {amount: '131.00', currency: 'INR'},
      }),
    ).toThrow('The payment amount changed');
  });

  it('fails closed if the backend unexpectedly routes this build to Cashfree', () => {
    expect(() =>
      prepareRazorpayHostedHandoff(checkout, {
        ...paymentOrder,
        provider: 'CASHFREE',
        checkoutKeyId: null,
        paymentSessionId: 'legacy_cashfree_session',
      }),
    ).toThrow('cannot securely open');
  });

  it('does not launch payment for a checkout that is already terminal', () => {
    expect(() =>
      prepareRazorpayHostedHandoff({...checkout, status: 'PAID'}, paymentOrder),
    ).toThrow('no longer eligible');
  });

  it('coalesces duplicate preparation taps for the same checkout', async () => {
    let resolveCreate: ((value: PaymentOrderHandoffSession) => void) | undefined;
    const createPaymentOrder = jest.fn(
      () =>
        new Promise<PaymentOrderHandoffSession>(resolve => {
          resolveCreate = resolve;
        }),
    );
    const coordinator = createPaymentHandoffCoordinator(createPaymentOrder);

    const first = coordinator.prepare(checkout);
    const second = coordinator.prepare(checkout);

    expect(createPaymentOrder).toHaveBeenCalledTimes(1);
    resolveCreate?.(paymentOrder);
    await expect(first).resolves.toMatchObject({paymentOrderId: paymentOrder.paymentOrderId});
    await expect(second).resolves.toMatchObject({paymentOrderId: paymentOrder.paymentOrderId});
  });

  it('does not reuse a stale client handoff across sequential payment attempts', async () => {
    const secondPaymentOrder: PaymentOrderHandoffSession = {
      ...paymentOrder,
      paymentOrderId: '77777777-7777-4777-8777-777777777777',
      cravesPaymentOrderRef: 'CRV_77777777777747778777777777777777',
      providerOrderId: 'order_Razorpay456',
      createdAt: '2026-08-16T10:02:00Z',
    };
    const createPaymentOrder = jest
      .fn<Promise<PaymentOrderHandoffSession>, [string]>()
      .mockResolvedValueOnce(paymentOrder)
      .mockResolvedValueOnce(secondPaymentOrder);
    const coordinator = createPaymentHandoffCoordinator(createPaymentOrder);

    await expect(coordinator.prepare(checkout)).resolves.toMatchObject({
      paymentOrderId: paymentOrder.paymentOrderId,
    });
    await expect(coordinator.prepare(checkout)).resolves.toMatchObject({
      paymentOrderId: secondPaymentOrder.paymentOrderId,
    });
    expect(createPaymentOrder).toHaveBeenCalledTimes(2);
  });

  it('keeps raw credentials disallowed while native Razorpay launch is enabled', () => {
    expect(paymentHandoffCapability.rawPaymentCredentialCollectionAllowed).toBe(false);
    expect(paymentHandoffCapability.tokenizedPaymentMethodContractSupported).toBe(false);
    expect(paymentHandoffCapability.nativeRazorpayLaunchSupported).toBe(true);
    expect(paymentHandoffCapability.backendVerificationRequiredForSuccess).toBe(true);
    expect(paymentHandoffCapability.longLivedClientHandoffCacheAllowed).toBe(false);
  });
});
