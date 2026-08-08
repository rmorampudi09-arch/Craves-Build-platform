import {AppApiError} from '../../core/http/apiError';
import type {CheckoutSession} from '../checkout/domain/checkoutTypes';
import {parsePaymentVerificationResult} from './api/paymentApi';
import {
  CASHFREE_NATIVE_PROVIDER_CALLBACK_BLOCKER,
  createPaymentRecoveryCoordinator,
  paymentRecoveryCapability,
  reconcilePaymentRecovery,
  requireNativeCashfreeCallbackAdapter,
} from './domain/paymentRecoveryCoordinator';
import type {
  CashfreeHostedHandoff,
  PaymentVerificationResult,
} from './domain/paymentTypes';

const handoff: CashfreeHostedHandoff = {
  provider: 'CASHFREE',
  paymentOrderId: '55555555-5555-4555-8555-555555555555',
  checkoutId: '11111111-1111-4111-8111-111111111111',
  cashfreeOrderId: 'CRV_11111111111141118111111111111111',
  paymentSessionId: 'session_kept_in_memory_only',
  amount: {amount: '130.00', currency: 'INR'},
};

const pendingCheckout: CheckoutSession = {
  checkoutId: handoff.checkoutId,
  customerIdentityId: '22222222-2222-4222-8222-222222222222',
  status: 'PAYMENT_PENDING',
  currency: 'INR',
  foodSubtotal: {amount: '100.00', currency: 'INR'},
  platformFee: {amount: '5.00', currency: 'INR'},
  taxAmount: {amount: '5.00', currency: 'INR'},
  deliveryFee: {amount: '20.00', currency: 'INR'},
  grandTotal: {amount: '130.0', currency: 'INR'},
  chargePolicyId: '33333333-3333-4333-8333-333333333333',
  deliveryAddressId: '44444444-4444-4444-8444-444444444444',
  orders: [],
  createdAt: '2026-08-08T10:00:00Z',
};

const paidCheckout: CheckoutSession = {
  ...pendingCheckout,
  status: 'PAID',
  orders: [
    {
      orderId: '66666666-6666-4666-8666-666666666666',
      checkoutId: handoff.checkoutId,
      status: 'CHEF_ACCEPTANCE_PENDING',
    },
  ],
};

function verification(status: PaymentVerificationResult['status']): PaymentVerificationResult {
  return {
    paymentOrderId: handoff.paymentOrderId,
    status,
    providerStatus: status === 'PAID' ? 'PAID' : 'ACTIVE',
  };
}

describe('P51 payment success/failure/cancel recovery', () => {
  it('parses the exact backend verification response', () => {
    expect(
      parsePaymentVerificationResult({
        paymentOrderId: handoff.paymentOrderId,
        status: 'PAID',
        providerStatus: 'PAID',
      }),
    ).toEqual(verification('PAID'));

    expect(
      parsePaymentVerificationResult({
        paymentOrderId: handoff.paymentOrderId,
        status: 'PAID',
        providerStatus: {unsafe: true},
      }),
    ).toBeNull();
  });

  it('declares success only after backend verification and checkout reconciliation agree', () => {
    const result = reconcilePaymentRecovery(
      handoff,
      {kind: 'CASHFREE_VERIFY_CALLBACK', cashfreeOrderId: handoff.cashfreeOrderId},
      verification('PAID'),
      paidCheckout,
    );

    expect(result.outcome).toBe('SUCCEEDED');
    expect(result.retryVerificationAllowed).toBe(false);
  });

  it('does not trust a provider error when the backend verifies payment as paid', async () => {
    const verifyPaymentOrder = jest.fn(async () => verification('PAID'));
    const readCheckoutSession = jest.fn(async () => paidCheckout);
    const coordinator = createPaymentRecoveryCoordinator(
      verifyPaymentOrder,
      readCheckoutSession,
    );

    await expect(
      coordinator.recover(handoff, {kind: 'PROVIDER_ERROR'}),
    ).resolves.toMatchObject({outcome: 'SUCCEEDED'});
    expect(verifyPaymentOrder).toHaveBeenCalledWith(handoff.paymentOrderId);
    expect(readCheckoutSession).toHaveBeenCalledWith(handoff.checkoutId);
  });

  it('keeps cancellation recoverable while the backend still reports payment pending', async () => {
    const coordinator = createPaymentRecoveryCoordinator(
      async () => verification('PAYMENT_PENDING'),
      async () => pendingCheckout,
    );

    await expect(
      coordinator.recover(handoff, {kind: 'PROVIDER_CANCELLED'}),
    ).resolves.toMatchObject({
      outcome: 'PENDING',
      retryVerificationAllowed: true,
      newPaymentAttemptAllowed: false,
    });
  });

  it('returns terminal failure only from an authoritative backend status', () => {
    expect(
      reconcilePaymentRecovery(
        handoff,
        {kind: 'MANUAL_RETRY'},
        verification('FAILED'),
        pendingCheckout,
      ),
    ).toMatchObject({outcome: 'FAILED', retryVerificationAllowed: false});
  });

  it('stays in reconciliation when payment and checkout authoritative states disagree', () => {
    expect(
      reconcilePaymentRecovery(
        handoff,
        {kind: 'APP_RESUME'},
        verification('PAID'),
        pendingCheckout,
      ),
    ).toMatchObject({outcome: 'RECONCILING', retryVerificationAllowed: true});
  });

  it('rejects a Cashfree verify callback for a different provider order', async () => {
    const verifyPaymentOrder = jest.fn(async () => verification('PAID'));
    const coordinator = createPaymentRecoveryCoordinator(
      verifyPaymentOrder,
      async () => paidCheckout,
    );

    await expect(
      coordinator.recover(handoff, {
        kind: 'CASHFREE_VERIFY_CALLBACK',
        cashfreeOrderId: 'different-provider-order',
      }),
    ).rejects.toThrow('different payment');
    expect(verifyPaymentOrder).not.toHaveBeenCalled();
  });

  it('coalesces concurrent verification for the same payment order', async () => {
    let resolveVerification:
      | ((value: PaymentVerificationResult) => void)
      | undefined;
    const verifyPaymentOrder = jest.fn(
      () =>
        new Promise<PaymentVerificationResult>(resolve => {
          resolveVerification = resolve;
        }),
    );
    const readCheckoutSession = jest.fn(async () => paidCheckout);
    const coordinator = createPaymentRecoveryCoordinator(
      verifyPaymentOrder,
      readCheckoutSession,
    );

    const first = coordinator.recover(handoff, {kind: 'APP_RESUME'});
    const second = coordinator.recover(handoff, {kind: 'MANUAL_RETRY'});

    expect(verifyPaymentOrder).toHaveBeenCalledTimes(1);
    resolveVerification?.(verification('PAID'));
    await expect(first).resolves.toMatchObject({outcome: 'SUCCEEDED'});
    await expect(second).resolves.toMatchObject({outcome: 'SUCCEEDED'});
    expect(readCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('keeps unsupported native callback wiring and terminal retry fail-closed', () => {
    expect(paymentRecoveryCapability.nativeCashfreeCallbackAdapterSupported).toBe(false);
    expect(paymentRecoveryCapability.newPaymentAttemptAfterTerminalFailureSupported).toBe(
      false,
    );

    try {
      requireNativeCashfreeCallbackAdapter();
      throw new Error('Expected native provider callback adapter to fail closed');
    } catch (error) {
      expect(error).toBeInstanceOf(AppApiError);
      expect((error as AppApiError).code).toBe(
        CASHFREE_NATIVE_PROVIDER_CALLBACK_BLOCKER,
      );
    }
  });
});
