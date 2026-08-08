import {AppApiError} from '../../../core/http/apiError';
import {checkoutApi} from '../../checkout/api/checkoutApi';
import type {CheckoutSession} from '../../checkout/domain/checkoutTypes';
import {paymentApi} from '../api/paymentApi';
import {samePaymentMoney} from './paymentHandoffCoordinator';
import type {
  CashfreeHostedHandoff,
  PaymentVerificationResult,
} from './paymentTypes';

export const CASHFREE_NATIVE_PROVIDER_CALLBACK_BLOCKER =
  'CASHFREE_NATIVE_PROVIDER_CALLBACK_UNAVAILABLE';
export const PAYMENT_TERMINAL_RETRY_CONTRACT_BLOCKER =
  'PAYMENT_TERMINAL_RETRY_CONTRACT_UNAVAILABLE';

export const paymentRecoveryCapability = {
  backendVerificationSupported: true,
  providerSignalCanDeclareSuccess: false,
  checkoutReconciliationSupported: true,
  concurrentVerificationCoalescing: true,
  manualVerificationRetrySupported: true,
  automaticVerificationPollingSupported: false,
  nativeCashfreeCallbackAdapterSupported: false,
  newPaymentAttemptAfterTerminalFailureSupported: false,
  blockerCodes: [
    CASHFREE_NATIVE_PROVIDER_CALLBACK_BLOCKER,
    PAYMENT_TERMINAL_RETRY_CONTRACT_BLOCKER,
  ],
} as const;

export type PaymentRecoveryTrigger =
  | {kind: 'CASHFREE_VERIFY_CALLBACK'; cashfreeOrderId: string}
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
) => Promise<PaymentVerificationResult>;
export type ReadCheckoutSession = (checkoutId: string) => Promise<CheckoutSession>;

interface ActivePaymentRecovery {
  paymentOrderId: string;
  promise: Promise<PaymentRecoveryResult>;
}

function validateRecoveryTrigger(
  handoff: CashfreeHostedHandoff,
  trigger: PaymentRecoveryTrigger,
): void {
  if (trigger.kind !== 'CASHFREE_VERIFY_CALLBACK') {
    return;
  }

  const providerOrderId = trigger.cashfreeOrderId.trim();
  if (!providerOrderId || providerOrderId.length > 160) {
    throw new AppApiError(
      'PAYMENT_PROVIDER_CALLBACK_INVALID',
      'Payment provider response could not be verified.',
    );
  }
  if (providerOrderId !== handoff.cashfreeOrderId) {
    throw new AppApiError(
      'PAYMENT_PROVIDER_ORDER_MISMATCH',
      'Payment provider response belongs to a different payment.',
    );
  }
}

function deriveOutcome(
  handoff: CashfreeHostedHandoff,
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

  if (checkout.status === 'PAID') {
    return 'RECONCILING';
  }

  if (verification.status === 'FAILED') {
    return 'FAILED';
  }
  if (verification.status === 'CANCELLED') {
    return 'CANCELLED';
  }
  if (checkout.status === 'CANCELLED') {
    return 'RECONCILING';
  }
  return 'PENDING';
}

export function reconcilePaymentRecovery(
  handoff: CashfreeHostedHandoff,
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
    handoff: CashfreeHostedHandoff,
    trigger: PaymentRecoveryTrigger,
  ): Promise<PaymentRecoveryResult>;
}

export function createPaymentRecoveryCoordinator(
  verifyPaymentOrder: VerifyPaymentOrder = paymentApi.verifyOrder,
  readCheckoutSession: ReadCheckoutSession = checkoutApi.getSession,
): PaymentRecoveryCoordinator {
  let active: ActivePaymentRecovery | null = null;

  return {
    recover(handoff, trigger) {
      try {
        validateRecoveryTrigger(handoff, trigger);
      } catch (error) {
        return Promise.reject(error);
      }

      if (active) {
        if (active.paymentOrderId === handoff.paymentOrderId) {
          return active.promise;
        }
        return Promise.reject(
          new AppApiError(
            'PAYMENT_RECOVERY_IN_PROGRESS',
            'Another payment status is already being verified.',
          ),
        );
      }

      let recovery: Promise<PaymentRecoveryResult>;
      recovery = verifyPaymentOrder(handoff.paymentOrderId)
        .then(async verification => {
          const checkout = await readCheckoutSession(handoff.checkoutId);
          return reconcilePaymentRecovery(handoff, trigger, verification, checkout);
        })
        .finally(() => {
          if (active?.promise === recovery) {
            active = null;
          }
        });

      active = {paymentOrderId: handoff.paymentOrderId, promise: recovery};
      return recovery;
    },
  };
}

export function requireNativeCashfreeCallbackAdapter(): never {
  throw new AppApiError(
    CASHFREE_NATIVE_PROVIDER_CALLBACK_BLOCKER,
    'Secure payment return handling is not available in this mobile build yet.',
  );
}

export const paymentRecoveryCoordinator = createPaymentRecoveryCoordinator();
