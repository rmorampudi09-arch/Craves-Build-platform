import {AppApiError} from '../../../core/http/apiError';
import {checkoutApi} from '../api/checkoutApi';
import type {
  CheckoutCreationIntent,
  CheckoutOperationRequest,
  CheckoutOperationResult,
  CheckoutSession,
} from './checkoutTypes';

export const checkoutSessionCapability = {
  authoritativeCreationSupported: true,
  authoritativeRevalidationOwnedByServer: true,
  clientDuplicateTapCoalescing: true,
  serverIdempotencySupported: true,
  automaticCreateRetrySupported: true,
  blockerCode: null,
} as const;

export interface CheckoutOperationClient {
  executeOperation(
    operationId: string,
    request: CheckoutOperationRequest,
  ): Promise<CheckoutOperationResult>;
  getOperation(operationId: string): Promise<CheckoutOperationResult>;
  getSession(checkoutId: string): Promise<CheckoutSession>;
}

interface ActiveCheckoutCreation {
  key: string;
  promise: Promise<CheckoutSession>;
}

interface SuccessfulCheckoutCreation {
  key: string;
  session: CheckoutSession;
}

function checkoutIntentKey(intent: CheckoutCreationIntent): string {
  const items = [...intent.expectedCart.items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(item => [item.id, item.quantity, item.updatedAt]);

  return JSON.stringify([
    intent.deliveryAddressId,
    intent.note ?? null,
    intent.expectedCart.cartId,
    items,
  ]);
}

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}

function hexWord(value: number): string {
  return value.toString(16).padStart(8, '0');
}

/**
 * The operation identifier is deterministic for the exact server request.
 * It is not a credential. A stable UUID lets the app recover the same
 * server-side receipt after a timeout or process restart without creating a
 * duplicate checkout.
 */
export function checkoutOperationIdForIntent(
  intent: CheckoutCreationIntent,
): string {
  const key = checkoutIntentKey(intent);
  const raw = [
    hash32(key, 0x811c9dc5),
    hash32(key, 0x9e3779b9),
    hash32(key, 0x85ebca6b),
    hash32(key, 0xc2b2ae35),
  ]
    .map(hexWord)
    .join('');

  const variant = ((Number.parseInt(raw[16], 16) & 0x3) | 0x8).toString(16);
  const uuidHex =
    raw.slice(0, 12) +
    '4' +
    raw.slice(13, 16) +
    variant +
    raw.slice(17);

  return [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20),
  ].join('-');
}

function operationRequest(
  intent: CheckoutCreationIntent,
): CheckoutOperationRequest {
  return {
    deliveryAddressId: intent.deliveryAddressId,
    note: intent.note,
    expectedCart: {
      cartId: intent.expectedCart.cartId,
      items: [...intent.expectedCart.items]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(item => ({...item})),
    },
  };
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

async function executeRecoverableCheckout(
  client: CheckoutOperationClient,
  operationId: string,
  request: CheckoutOperationRequest,
): Promise<CheckoutSession> {
  let operation: CheckoutOperationResult;

  try {
    operation = await client.executeOperation(operationId, request);
  } catch (error) {
    if (isDefinitiveServerRejection(error)) throw error;

    try {
      operation = await client.getOperation(operationId);
    } catch {
      // A read may race the original transaction. Replaying the exact same
      // operation ID and request is safe because the server owns idempotency.
      operation = await client.executeOperation(operationId, request);
    }
  }

  return client.getSession(operation.checkoutId);
}

export interface CheckoutSessionCoordinator {
  create(intent: CheckoutCreationIntent): Promise<CheckoutSession>;
}

export function createCheckoutSessionCoordinator(
  client: CheckoutOperationClient = checkoutApi,
): CheckoutSessionCoordinator {
  let active: ActiveCheckoutCreation | null = null;
  let successful: SuccessfulCheckoutCreation | null = null;

  return {
    create(intent) {
      const key = checkoutIntentKey(intent);

      if (successful?.key === key) {
        return Promise.resolve(successful.session);
      }

      if (active) {
        if (active.key === key) return active.promise;
        return Promise.reject(
          new AppApiError(
            'CHECKOUT_CREATION_IN_PROGRESS',
            'Checkout is already being created. Please wait for it to finish.',
          ),
        );
      }

      const operationId = checkoutOperationIdForIntent(intent);
      const request = operationRequest(intent);

      let requestPromise: Promise<CheckoutSession>;
      requestPromise = executeRecoverableCheckout(client, operationId, request)
        .then(session => {
          successful = {key, session};
          return session;
        })
        .finally(() => {
          if (active?.promise === requestPromise) active = null;
        });

      active = {key, promise: requestPromise};
      return requestPromise;
    },
  };
}

export const checkoutSessionCoordinator = createCheckoutSessionCoordinator();
