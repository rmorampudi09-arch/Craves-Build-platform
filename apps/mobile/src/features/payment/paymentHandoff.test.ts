import {AppApiError} from '../../core/http/apiError';
import type {CheckoutSession} from '../checkout/domain/checkoutTypes';
import {
  parsePaymentOrderHandoffSession,
  parsePaymentOrderSnapshot,
} from './api/paymentApi';
import {
  CASHFREE_NATIVE_PROVIDER_LAUNCH_BLOCKER,
  createPaymentHandoffCoordinator,
  paymentHandoffCapability,
  prepareCashfreeHostedHandoff,
  requireNativeCashfreeProviderLaunch,
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
  createdAt: '2026-08-08T10:00:00Z',
};

const paymentOrder: PaymentOrderHandoffSession = {
  paymentOrderId: '55555555-5555-4555-8555-555555555555',
  checkoutId: checkout.checkoutId,
  cravesPaymentOrderRef: 'CRV_11111111111141118111111111111111',
  cashfreeOrderId: 'CRV_11111111111141118111111111111111',
  cfOrderId: '987654321',
  paymentSessionId: 'session_for_provider_only',
  amount: {amount: '130.0', currency: 'INR'},
  status: 'PAYMENT_PENDING',
  createdAt: '2026-08-08T10:01:00Z',
};

describe('P50 payment eligibility and provider handoff', () => {
  it('parses the exact create-payment response needed for provider handoff', () => {
    expect(
      parsePaymentOrderHandoffSession({
        paymentOrderId: paymentOrder.paymentOrderId,
        checkoutId: paymentOrder.checkoutId,
        cravesPaymentOrderRef: paymentOrder.cravesPaymentOrderRef,
        cashfreeOrderId: paymentOrder.cashfreeOrderId,
        cfOrderId: paymentOrder.cfOrderId,
        paymentSessionId: paymentOrder.paymentSessionId,
        amount: 130,
        currency: 'INR',
        status: 'PAYMENT_PENDING',
        createdAt: paymentOrder.createdAt,
      }),
    ).toEqual({...paymentOrder, amount: {amount: '130', currency: 'INR'}});
  });

  it('parses the owned read model without exposing a payment session', () => {
    const snapshot = parsePaymentOrderSnapshot({
      paymentOrderId: paymentOrder.paymentOrderId,
      checkoutId: paymentOrder.checkoutId,
      customerIdentityId: checkout.customerIdentityId,
      cravesPaymentOrderRef: paymentOrder.cravesPaymentOrderRef,
      cashfreeOrderId: paymentOrder.cashfreeOrderId,
      cfOrderId: paymentOrder.cfOrderId,
      amount: '130.00',
      currency: 'INR',
      status: 'PAYMENT_PENDING',
      providerStatus: 'ACTIVE',
      createdAt: paymentOrder.createdAt,
      updatedAt: paymentOrder.createdAt,
    });

    expect(snapshot?.amount).toEqual({amount: '130.00', currency: 'INR'});
    expect(snapshot).not.toHaveProperty('paymentSessionId');
  });

  it('cross-checks checkout identity and authoritative amount before handoff', () => {
    expect(prepareCashfreeHostedHandoff(checkout, paymentOrder)).toMatchObject({
      provider: 'CASHFREE',
      checkoutId: checkout.checkoutId,
      paymentOrderId: paymentOrder.paymentOrderId,
      amount: {amount: '130.0', currency: 'INR'},
    });

    expect(() =>
      prepareCashfreeHostedHandoff(checkout, {
        ...paymentOrder,
        amount: {amount: '131.00', currency: 'INR'},
      }),
    ).toThrow('The payment amount changed');
  });

  it('does not launch payment for a checkout that is already terminal', () => {
    expect(() =>
      prepareCashfreeHostedHandoff({...checkout, status: 'PAID'}, paymentOrder),
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

  it('keeps raw credential collection and unsupported native launch disabled', () => {
    expect(paymentHandoffCapability.rawPaymentCredentialCollectionAllowed).toBe(false);
    expect(paymentHandoffCapability.tokenizedPaymentMethodContractSupported).toBe(false);
    expect(paymentHandoffCapability.nativeCashfreeLaunchSupported).toBe(false);

    try {
      requireNativeCashfreeProviderLaunch();
      throw new Error('Expected native provider launch to fail closed');
    } catch (error) {
      expect(error).toBeInstanceOf(AppApiError);
      expect((error as AppApiError).code).toBe(CASHFREE_NATIVE_PROVIDER_LAUNCH_BLOCKER);
    }
  });
});
