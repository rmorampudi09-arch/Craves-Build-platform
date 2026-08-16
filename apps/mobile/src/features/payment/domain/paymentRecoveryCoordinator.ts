import {AppApiError} from '../../../core/http/apiError';
import {checkoutApi} from '../../checkout/api/checkoutApi';
import type {CheckoutSession} from '../../checkout/domain/checkoutTypes';
import {paymentApi} from '../api/paymentApi';
import {samePaymentMoney} from './paymentHandoffCoordinator';
import type {
  PaymentOrderSnapshot,
  PaymentRecoveryReference,
  PaymentVerificationResult,
  RazorpayVerificationProof,
} from './paymentTypes';

export const PAYMENT_TERMINAL_RETRY_CONTRACT_BLOCKER =
  'PAYMENT_TERMINAL_RETRY_CONTRACT_UNAVAILABLE';

export const paymentRecoveryCapability = {
  signedRazorpayVerificationSupported: true,
  providerSignalCanDeclareSuccess: false,
  paymentOrderStatusRecoverySupported: true,
  checkoutReconciliationSupported: true,
  concurrentRecoveryCoalescing: true,
  manualStatusRetrySupported: true,
  automaticVerificationPollingSupported: false,
  nativeRazorpayCallbackAdapterSupported: true,
  persistedProcessRecoverySupported: true,
  newPaymentAttemptAfterTerminalFailureSupported: false,
  blockerCodes: [PAYMENT_TERMINAL_RETRY_CONTRACT_BLOCKER],
} as const;

export type PaymentRecoveryTrigger =
  | {kind: 'RAZORPAY_SUCCESS'; proof: RazorpayVerificationProof}
  | {kind: 'PROVIDER_ERROR'}
  | {kind: 'PROVIDER_CANCELLED'}
  | {kind: 'APP_RESUME'}
  | {kind: 'MANUAL_RETRY'};

export type PaymentRecoveryOutcome =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PENDING'
  | 'RECONCILING';

export interface PaymentRecoveryResult {
  outcome: PaymentRecoveryOutcome;
  triggerKind: PaymentRecoveryTrigger['kind'];
  verification: PaymentVerificationResult;
  checkout: CheckoutSession;
  retryVerificationAllowed: boolean;
  newPaymentAttemptAllowed: false;
}

export type VerifyPaymentOrder = (
  paymentOrderId: string,
  proof: RazorpayVerificationProof,
) => Promise<PaymentVerificationResult>;
export type ReadPaymentOrder = (
  paymentOrderId: string,
) => Promise<PaymentOrderSnapshot>;
export type ReadCheckoutSession = (checkoutId: string) => Promise<CheckoutSession>;

interface ActivePaymentRecovery {
  paymentOrderId: string;
  promise: Promise<PaymentRecoveryResult>;
}

function validateRazorpaySuccess(
  handoff: PaymentRecoveryReference,
  proof: RazorpayVerificationProof,
): void {
  if (proof.providerOrderId !== handoff.providerOrderId) {
    throw new AppApiError(
      'PAYMENT_PROVIDER_ORDER_MISMATCH',
      'Payment provider response belongs to a different payment.',
    );
  }
}

function snapshotAsVerification(snapshot: PaymentOrderSnapshot): PaymentVerificationResult {
  return {
    paymentOrderId: snapshot.paymentOrderId,
    status: snapshot.status,
    providerStatus: snapshot.providerStatus,
    providerPaymentId: snapshot.providerPaymentId,
  };
}

function deriveOutcome(
  handoff: PaymentRecoveryReference,
  verification: PaymentVerificationResult,
  checkout: CheckoutSession,
): PaymentRecoveryOutcome {
  if (
    verification.paymentOrderId !== handoff.paymentOrderId ||
    checkout.checkoutId !== handoff.checkoutId ||
    !samePaymentMoney(handoff.amount, checkout.grandTotal)
  ) {
    return 'RECONCILING';
  }

  if (verification.status === 'PAID') {
    return checkout.status === 'PAID' ? 'SUCCEEDED' : 'RECONCILING';
  }
  if (checkout.status === 'PAID') return 'RECONCILING';
  if (verification.status === 'FAILED') return 'FAILED';
  if (verification.status === 'CANCELLED') return 'CANCELLED';
  if (checkout.status === 'CANCELLED') return 'RECONCILING';
  return 'PENDING';
}

export function reconcilePaymentRecovery(
  handoff: PaymentRecoveryReference,
  trigger: PaymentRecoveryTrigger,
  verification: PaymentVerificationResult,
  checkout: CheckoutSession,
): PaymentRecoveryResult {
  const outcome = deriveOutcome(handoff, verification, checkout);
  return {
    outcome,
    triggerKind: trigger.kind,
    verification,
    checkout,
    retryVerificationAllowed: outcome === 'PENDING' || outcome === 'RECONCILING',
    newPaymentAttemptAllowed: false,
  };
}

export interface PaymentRecoveryCoordinator {
  recover(
    handoff: PaymentRecoveryReference,
    trigger: PaymentRecoveryTrigger,
  ): Promise<PaymentRecoveryResult>;
}

export function createPaymentRecoveryCoordinator(
  verifyPaymentOrder: VerifyPaymentOrder = paymentApi.verifyOrder,
  readPaymentOrder: ReadPaymentOrder = paymentApi.getOrder,
  readCheckoutSession: ReadCheckoutSession = checkoutApi.getSession,
): PaymentRecoveryCoordinator {
  let active: ActivePaymentRecovery | null = null;

  return {
    recover(handoff, trigger) {
      if (active) {
        if (active.paymentOrderId === handoff.paymentOrderId) return active.promise;
        return Promise.reject(
          new AppApiError(
            'PAYMENT_RECOVERY_IN_PROGRESS',
            'Another payment status is already being verified.',
          ),
        );
      }

      let recovery: Promise<PaymentRecoveryResult>;
      recovery = (async () => {
        let verification: PaymentVerificationResult;
        if (trigger.kind === 'RAZORPAY_SUCCESS') {
          validateRazorpaySuccess(handoff, trigger.proof);
          verification = await verifyPaymentOrder(handoff.paymentOrderId, trigger.proof);
        } else {
          verification = snapshotAsVerification(
            await readPaymentOrder(handoff.paymentOrderId),
          );
        }
        const checkout = await readCheckoutSession(handoff.checkoutId);
        return reconcilePaymentRecovery(handoff, trigger, verification, checkout);
      })().finally(() => {
        if (active?.promise === recovery) active = null;
      });

      active = {paymentOrderId: handoff.paymentOrderId, promise: recovery};
      return recovery;
    },
  };
}

export const paymentRecoveryCoordinator = createPaymentRecoveryCoordinator();
