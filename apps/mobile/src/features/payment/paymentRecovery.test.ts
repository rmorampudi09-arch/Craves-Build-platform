import type {CheckoutSession} from '../checkout/domain/checkoutTypes';
import {parsePaymentVerificationResult} from './api/paymentApi';
import {
  createPaymentRecoveryCoordinator,
  paymentRecoveryCapability,
  reconcilePaymentRecovery,
} from './domain/paymentRecoveryCoordinator';
import type {
  PaymentOrderSnapshot,
  PaymentVerificationResult,
  RazorpayHostedHandoff,
  RazorpayVerificationProof,
} from './domain/paymentTypes';

const handoff: RazorpayHostedHandoff = {
  provider: 'RAZORPAY',
  paymentOrderId: '55555555-5555-4555-8555-555555555555',
  checkoutId: '11111111-1111-4111-8111-111111111111',
  providerOrderId: 'order_Razorpay123',
  checkoutKeyId: 'rzp_test_public_key',
  amount: {amount: '130.00', currency: 'INR'},
};

const proof: RazorpayVerificationProof = {
  providerOrderId: handoff.providerOrderId,
  providerPaymentId: 'pay_Razorpay456',
  providerSignature: 'signed_payload_proof',
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
  createdAt: '2026-08-16T10:00:00Z',
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
    providerStatus: status === 'PAID' ? 'captured' : 'created',
    providerPaymentId: status === 'PAID' ? proof.providerPaymentId : null,
  };
}

function snapshot(status: PaymentOrderSnapshot['status']): PaymentOrderSnapshot {
  return {
    paymentOrderId: handoff.paymentOrderId,
    checkoutId: handoff.checkoutId,
    customerIdentityId: pendingCheckout.customerIdentityId,
    cravesPaymentOrderRef: 'CRV_55555555555545558555555555555555',
    provider: 'RAZORPAY',
    providerOrderId: handoff.providerOrderId,
    providerPaymentId: status === 'PAID' ? proof.providerPaymentId : null,
    amount: handoff.amount,
    status,
    providerStatus: status === 'PAID' ? 'captured' : 'created',
    createdAt: '2026-08-16T10:01:00Z',
    updatedAt: '2026-08-16T10:02:00Z',
  };
}

describe('production Razorpay payment success/failure/cancel recovery', () => {
  it('parses the current backend verification response including provider payment id', () => {
    expect(
      parsePaymentVerificationResult({
        paymentOrderId: handoff.paymentOrderId,
        status: 'PAID',
        providerStatus: 'captured',
        providerPaymentId: proof.providerPaymentId,
      }),
    ).toEqual(verification('PAID'));
  });

  it('declares success only after signed backend verification and checkout reconciliation agree', async () => {
    const verifyPaymentOrder = jest.fn(async () => verification('PAID'));
    const readPaymentOrder = jest.fn(async () => snapshot('PAYMENT_PENDING'));
    const readCheckoutSession = jest.fn(async () => paidCheckout);
    const coordinator = createPaymentRecoveryCoordinator(
      verifyPaymentOrder,
      readPaymentOrder,
      readCheckoutSession,
    );

    await expect(
      coordinator.recover(handoff, {kind: 'RAZORPAY_SUCCESS', proof}),
    ).resolves.toMatchObject({outcome: 'SUCCEEDED'});
    expect(verifyPaymentOrder).toHaveBeenCalledWith(handoff.paymentOrderId, proof);
    expect(readPaymentOrder).not.toHaveBeenCalled();
  });

  it('never trusts provider error as payment failure when backend status is paid', async () => {
    const verifyPaymentOrder = jest.fn(async () => verification('PAID'));
    const readPaymentOrder = jest.fn(async () => snapshot('PAID'));
    const coordinator = createPaymentRecoveryCoordinator(
      verifyPaymentOrder,
      readPaymentOrder,
      async () => paidCheckout,
    );

    await expect(
      coordinator.recover(handoff, {kind: 'PROVIDER_ERROR'}),
    ).resolves.toMatchObject({outcome: 'SUCCEEDED'});
    expect(verifyPaymentOrder).not.toHaveBeenCalled();
    expect(readPaymentOrder).toHaveBeenCalledWith(handoff.paymentOrderId);
  });

  it('uses GET recovery rather than signature verification after cancellation', async () => {
    const verifyPaymentOrder = jest.fn(async () => verification('PAID'));
    const readPaymentOrder = jest.fn(async () => snapshot('PAYMENT_PENDING'));
    const coordinator = createPaymentRecoveryCoordinator(
      verifyPaymentOrder,
      readPaymentOrder,
      async () => pendingCheckout,
    );

    await expect(
      coordinator.recover(handoff, {kind: 'PROVIDER_CANCELLED'}),
    ).resolves.toMatchObject({
      outcome: 'PENDING',
      retryVerificationAllowed: true,
      newPaymentAttemptAllowed: false,
    });
    expect(verifyPaymentOrder).not.toHaveBeenCalled();
    expect(readPaymentOrder).toHaveBeenCalledTimes(1);
  });

  it('rejects signed success for a different Razorpay order before backend verification', async () => {
    const verifyPaymentOrder = jest.fn(async () => verification('PAID'));
    const coordinator = createPaymentRecoveryCoordinator(
      verifyPaymentOrder,
      async () => snapshot('PAYMENT_PENDING'),
      async () => paidCheckout,
    );

    await expect(
      coordinator.recover(handoff, {
        kind: 'RAZORPAY_SUCCESS',
        proof: {...proof, providerOrderId: 'order_different'},
      }),
    ).rejects.toThrow('different payment');
    expect(verifyPaymentOrder).not.toHaveBeenCalled();
  });

  it('returns terminal failure only from authoritative backend state', () => {
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

  it('coalesces concurrent recovery for the same payment order', async () => {
    let resolvePayment: ((value: PaymentOrderSnapshot) => void) | undefined;
    const readPaymentOrder = jest.fn(
      () =>
        new Promise<PaymentOrderSnapshot>(resolve => {
          resolvePayment = resolve;
        }),
    );
    const readCheckoutSession = jest.fn(async () => paidCheckout);
    const coordinator = createPaymentRecoveryCoordinator(
      async () => verification('PAID'),
      readPaymentOrder,
      readCheckoutSession,
    );

    const first = coordinator.recover(handoff, {kind: 'APP_RESUME'});
    const second = coordinator.recover(handoff, {kind: 'MANUAL_RETRY'});

    expect(readPaymentOrder).toHaveBeenCalledTimes(1);
    resolvePayment?.(snapshot('PAID'));
    await expect(first).resolves.toMatchObject({outcome: 'SUCCEEDED'});
    await expect(second).resolves.toMatchObject({outcome: 'SUCCEEDED'});
    expect(readCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('keeps provider signals non-authoritative and terminal retries fail-closed', () => {
    expect(paymentRecoveryCapability.providerSignalCanDeclareSuccess).toBe(false);
    expect(paymentRecoveryCapability.nativeRazorpayCallbackAdapterSupported).toBe(true);
    expect(paymentRecoveryCapability.newPaymentAttemptAfterTerminalFailureSupported).toBe(false);
  });
});
