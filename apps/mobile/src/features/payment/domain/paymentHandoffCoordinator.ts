import {AppApiError} from '../../../core/http/apiError';
import type {CheckoutSession} from '../../checkout/domain/checkoutTypes';
import {paymentApi} from '../api/paymentApi';
import type {
  PaymentMoney,
  PaymentOrderHandoffSession,
  RazorpayHostedHandoff,
} from './paymentTypes';

export const PAYMENT_METHOD_TOKEN_CONTRACT_BLOCKER =
  'PAYMENT_METHOD_TOKEN_CONTRACT_UNAVAILABLE';
export const PAYMENT_TERMINAL_RETRY_CONTRACT_BLOCKER =
  'PAYMENT_TERMINAL_RETRY_CONTRACT_UNAVAILABLE';

export const paymentHandoffCapability = {
  authoritativePaymentOrderCreationSupported: true,
  checkoutOwnershipAndAmountRevalidationOwnedByServer: true,
  clientCheckoutAmountCrossCheckSupported: true,
  clientDuplicateTapCoalescing: true,
  rawPaymentCredentialCollectionAllowed: false,
  tokenizedPaymentMethodContractSupported: false,
  nativeRazorpayLaunchSupported: true,
  backendVerificationRequiredForSuccess: true,
  newPaymentAttemptAfterTerminalFailureSupported: false,
  blockerCodes: [
    PAYMENT_METHOD_TOKEN_CONTRACT_BLOCKER,
    PAYMENT_TERMINAL_RETRY_CONTRACT_BLOCKER,
  ],
} as const;

export type CreatePaymentOrder = (
  checkoutId: string,
) => Promise<PaymentOrderHandoffSession>;

interface ActivePaymentPreparation {
  checkoutId: string;
  promise: Promise<RazorpayHostedHandoff>;
}

function canonicalDecimal(value: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [wholeRaw, fractionalRaw = ''] = value.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fractional = fractionalRaw.replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : whole;
}

export function samePaymentMoney(left: PaymentMoney, right: PaymentMoney): boolean {
  return (
    left.currency === right.currency &&
    canonicalDecimal(left.amount) !== null &&
    canonicalDecimal(left.amount) === canonicalDecimal(right.amount)
  );
}

function requireEligibleCheckout(checkout: CheckoutSession): void {
  if (checkout.status !== 'PAYMENT_PENDING') {
    throw new AppApiError(
      'PAYMENT_CHECKOUT_NOT_ELIGIBLE',
      'This checkout is no longer eligible for a new payment attempt.',
    );
  }
}

export function prepareRazorpayHostedHandoff(
  checkout: CheckoutSession,
  paymentOrder: PaymentOrderHandoffSession,
): RazorpayHostedHandoff {
  requireEligibleCheckout(checkout);

  if (paymentOrder.checkoutId !== checkout.checkoutId) {
    throw new AppApiError(
      'PAYMENT_CHECKOUT_MISMATCH',
      'Payment information belongs to a different checkout. Please refresh and try again.',
    );
  }
  if (!samePaymentMoney(paymentOrder.amount, checkout.grandTotal)) {
    throw new AppApiError(
      'PAYMENT_AMOUNT_MISMATCH',
      'The payment amount changed. Refresh checkout before continuing.',
    );
  }
  if (paymentOrder.provider !== 'RAZORPAY') {
    throw new AppApiError(
      'PAYMENT_PROVIDER_UNSUPPORTED',
      'This mobile build cannot securely open the payment provider returned by Craves.',
    );
  }
  if (!paymentOrder.checkoutKeyId || !paymentOrder.providerOrderId) {
    throw new AppApiError(
      'PAYMENT_PROVIDER_SESSION_INCOMPLETE',
      'Secure payment information is incomplete. Please refresh and try again.',
    );
  }
  if (paymentOrder.status !== 'CREATED' && paymentOrder.status !== 'PAYMENT_PENDING') {
    throw new AppApiError(
      'PAYMENT_ORDER_NOT_LAUNCHABLE',
      'This payment is no longer ready for provider authorization.',
    );
  }

  return {
    provider: 'RAZORPAY',
    paymentOrderId: paymentOrder.paymentOrderId,
    checkoutId: paymentOrder.checkoutId,
    providerOrderId: paymentOrder.providerOrderId,
    checkoutKeyId: paymentOrder.checkoutKeyId,
    amount: paymentOrder.amount,
  };
}

export interface PaymentHandoffCoordinator {
  prepare(checkout: CheckoutSession): Promise<RazorpayHostedHandoff>;
}

export function createPaymentHandoffCoordinator(
  createPaymentOrder: CreatePaymentOrder = paymentApi.createOrder,
): PaymentHandoffCoordinator {
  let active: ActivePaymentPreparation | null = null;
  let successful: RazorpayHostedHandoff | null = null;

  return {
    prepare(checkout) {
      requireEligibleCheckout(checkout);

      if (successful?.checkoutId === checkout.checkoutId) {
        return Promise.resolve(successful);
      }
      if (active) {
        if (active.checkoutId === checkout.checkoutId) return active.promise;
        return Promise.reject(
          new AppApiError(
            'PAYMENT_PREPARATION_IN_PROGRESS',
            'Another payment is already being prepared.',
          ),
        );
      }

      let preparation: Promise<RazorpayHostedHandoff>;
      preparation = createPaymentOrder(checkout.checkoutId)
        .then(paymentOrder => prepareRazorpayHostedHandoff(checkout, paymentOrder))
        .then(handoff => {
          successful = handoff;
          return handoff;
        })
        .finally(() => {
          if (active?.promise === preparation) active = null;
        });
      active = {checkoutId: checkout.checkoutId, promise: preparation};
      return preparation;
    },
  };
}

export const paymentHandoffCoordinator = createPaymentHandoffCoordinator();
