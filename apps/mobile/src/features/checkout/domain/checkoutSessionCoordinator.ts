import {AppApiError} from '../../../core/http/apiError';
import {checkoutApi} from '../api/checkoutApi';
import type {
  CheckoutCreateRequest,
  CheckoutCreationIntent,
  CheckoutSession,
} from './checkoutTypes';

export const CHECKOUT_SERVER_IDEMPOTENCY_CONTRACT_BLOCKER =
  'CHECKOUT_SERVER_IDEMPOTENCY_CONTRACT_UNAVAILABLE';

export const checkoutSessionCapability = {
  authoritativeCreationSupported: true,
  authoritativeRevalidationOwnedByServer: true,
  clientDuplicateTapCoalescing: true,
  serverIdempotencySupported: false,
  automaticCreateRetrySupported: false,
  blockerCode: CHECKOUT_SERVER_IDEMPOTENCY_CONTRACT_BLOCKER,
} as const;

export type CheckoutCreateSession = (
  request: CheckoutCreateRequest,
) => Promise<CheckoutSession>;

interface ActiveCheckoutCreation {
  key: string;
  promise: Promise<CheckoutSession>;
}

interface SuccessfulCheckoutCreation {
  key: string;
  session: CheckoutSession;
}

function checkoutIntentKey(intent: CheckoutCreationIntent): string {
  return JSON.stringify([
    intent.cartId,
    intent.cartClientRevision,
    intent.deliveryAddressId,
    intent.note ?? null,
  ]);
}

function isDefinitiveServerRejection(error: unknown): boolean {
  return (
    error instanceof AppApiError &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

function uncertainOutcomeError(): AppApiError {
  return new AppApiError(
    'CHECKOUT_CREATION_OUTCOME_UNCERTAIN',
    'Checkout may already have been created. Refresh your order state before trying again.',
  );
}

export interface CheckoutSessionCoordinator {
  create(intent: CheckoutCreationIntent): Promise<CheckoutSession>;
}

export function createCheckoutSessionCoordinator(
  createSession: CheckoutCreateSession = checkoutApi.createSession,
): CheckoutSessionCoordinator {
  let active: ActiveCheckoutCreation | null = null;
  let successful: SuccessfulCheckoutCreation | null = null;
  let uncertainIntentKey: string | null = null;

  return {
    create(intent) {
      const key = checkoutIntentKey(intent);

      if (successful?.key === key) {
        return Promise.resolve(successful.session);
      }

      if (uncertainIntentKey === key) {
        return Promise.reject(uncertainOutcomeError());
      }

      if (active) {
        if (active.key === key) {
          return active.promise;
        }
        return Promise.reject(
          new AppApiError(
            'CHECKOUT_CREATION_IN_PROGRESS',
            'Checkout is already being created. Please wait for it to finish.',
          ),
        );
      }

      let requestPromise: Promise<CheckoutSession>;
      requestPromise = createSession({
        deliveryAddressId: intent.deliveryAddressId,
        note: intent.note,
      })
        .then(session => {
          successful = {key, session};
          uncertainIntentKey = null;
          return session;
        })
        .catch((error: unknown) => {
          if (!isDefinitiveServerRejection(error)) {
            uncertainIntentKey = key;
          }
          throw error;
        })
        .finally(() => {
          if (active?.promise === requestPromise) {
            active = null;
          }
        });

      active = {key, promise: requestPromise};
      return requestPromise;
    },
  };
}

export const checkoutSessionCoordinator = createCheckoutSessionCoordinator();
