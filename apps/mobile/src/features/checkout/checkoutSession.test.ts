import {AppApiError} from '../../core/http/apiError';
import {parseCheckoutSession} from './api/checkoutApi';
import {
  CHECKOUT_SERVER_IDEMPOTENCY_CONTRACT_BLOCKER,
  checkoutSessionCapability,
  createCheckoutSessionCoordinator,
} from './domain/checkoutSessionCoordinator';
import type {
  CheckoutCreationIntent,
  CheckoutSession,
} from './domain/checkoutTypes';

const checkoutId = '11111111-1111-4111-8111-111111111111';
const customerIdentityId = '22222222-2222-4222-8222-222222222222';
const chargePolicyId = '33333333-3333-4333-8333-333333333333';
const seededChargePolicyId = '20000000-0000-0000-0000-000000000001';
const deliveryAddressId = '44444444-4444-4444-8444-444444444444';
const orderId = '55555555-5555-4555-8555-555555555555';
const cartId = '66666666-6666-4666-8666-666666666666';

const apiResponse = {
  id: checkoutId,
  customerIdentityId,
  status: 'PAYMENT_PENDING',
  currency: 'INR',
  foodSubtotal: 250,
  platformFee: 10,
  taxAmount: 13,
  deliveryFee: 40,
  grandTotal: 313,
  chargePolicyId,
  deliveryAddressId,
  orders: [
    {
      id: orderId,
      checkoutId,
      status: 'PAYMENT_PENDING',
    },
  ],
  createdAt: '2026-08-08T12:00:00Z',
};

const session = parseCheckoutSession(apiResponse) as CheckoutSession;
const intent: CheckoutCreationIntent = {
  cartId,
  cartClientRevision: 8,
  deliveryAddressId,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

describe('P49 checkout session creation', () => {
  it('parses the authoritative checkout session and server-owned totals', () => {
    expect(session).toEqual({
      checkoutId,
      customerIdentityId,
      status: 'PAYMENT_PENDING',
      currency: 'INR',
      foodSubtotal: {amount: '250', currency: 'INR'},
      platformFee: {amount: '10', currency: 'INR'},
      taxAmount: {amount: '13', currency: 'INR'},
      deliveryFee: {amount: '40', currency: 'INR'},
      grandTotal: {amount: '313', currency: 'INR'},
      chargePolicyId,
      deliveryAddressId,
      orders: [{orderId, checkoutId, status: 'PAYMENT_PENDING'}],
      createdAt: '2026-08-08T12:00:00Z',
    });
  });

  it('accepts the seeded PostgreSQL charge-policy UUID used by the live backend', () => {
    expect(
      parseCheckoutSession({
        ...apiResponse,
        chargePolicyId: seededChargePolicyId,
      }),
    ).toMatchObject({chargePolicyId: seededChargePolicyId});
  });

  it('still rejects malformed charge-policy identifiers', () => {
    expect(
      parseCheckoutSession({
        ...apiResponse,
        chargePolicyId: 'not-a-uuid',
      }),
    ).toBeNull();
  });

  it('rejects a response whose order does not belong to the returned checkout', () => {
    expect(
      parseCheckoutSession({
        ...apiResponse,
        orders: [
          {
            ...apiResponse.orders[0],
            checkoutId: '77777777-7777-4777-8777-777777777777',
          },
        ],
      }),
    ).toBeNull();
  });

  it('coalesces duplicate create taps and reuses the successful session for the same intent', async () => {
    const pending = deferred<CheckoutSession>();
    const createSession = jest.fn(() => pending.promise);
    const coordinator = createCheckoutSessionCoordinator(createSession);

    const first = coordinator.create(intent);
    const duplicate = coordinator.create(intent);

    expect(duplicate).toBe(first);
    expect(createSession).toHaveBeenCalledTimes(1);

    pending.resolve(session);
    await expect(first).resolves.toBe(session);
    await expect(coordinator.create(intent)).resolves.toBe(session);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('blocks a different checkout intent while creation is already in flight', async () => {
    const pending = deferred<CheckoutSession>();
    const createSession = jest.fn(() => pending.promise);
    const coordinator = createCheckoutSessionCoordinator(createSession);

    const first = coordinator.create(intent);
    await expect(
      coordinator.create({...intent, cartClientRevision: 9}),
    ).rejects.toMatchObject({code: 'CHECKOUT_CREATION_IN_PROGRESS'});
    expect(createSession).toHaveBeenCalledTimes(1);

    pending.resolve(session);
    await expect(first).resolves.toBe(session);
  });

  it('does not replay the same POST after an uncertain transport outcome', async () => {
    const createSession = jest.fn(() =>
      Promise.reject(
        new AppApiError(
          'NETWORK_ERROR',
          'We could not reach Craves. Check your connection and try again.',
          undefined,
          undefined,
          true,
        ),
      ),
    );
    const coordinator = createCheckoutSessionCoordinator(createSession);

    await expect(coordinator.create(intent)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    await expect(coordinator.create(intent)).rejects.toMatchObject({
      code: 'CHECKOUT_CREATION_OUTCOME_UNCERTAIN',
    });
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('allows a corrected retry after a definitive client rejection', async () => {
    const createSession = jest.fn(() =>
      Promise.reject(
        new AppApiError(
          'DELIVERY_ADDRESS_REQUIRED',
          'Choose a delivery address.',
          400,
        ),
      ),
    );
    const coordinator = createCheckoutSessionCoordinator(createSession);

    await expect(coordinator.create(intent)).rejects.toMatchObject({
      code: 'DELIVERY_ADDRESS_REQUIRED',
    });
    await expect(coordinator.create(intent)).rejects.toMatchObject({
      code: 'DELIVERY_ADDRESS_REQUIRED',
    });
    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it('records the missing server idempotency contract instead of inventing one', () => {
    expect(checkoutSessionCapability).toEqual({
      authoritativeCreationSupported: true,
      authoritativeRevalidationOwnedByServer: true,
      clientDuplicateTapCoalescing: true,
      serverIdempotencySupported: false,
      automaticCreateRetrySupported: false,
      blockerCode: CHECKOUT_SERVER_IDEMPOTENCY_CONTRACT_BLOCKER,
    });
  });
});
