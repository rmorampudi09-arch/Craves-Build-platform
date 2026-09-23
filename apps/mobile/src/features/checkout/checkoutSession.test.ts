import {AppApiError} from '../../core/http/apiError';
import {
  parseCheckoutOperationResult,
  parseCheckoutSession,
} from './api/checkoutApi';
import {
  checkoutOperationIdForIntent,
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
const cartLineId = '77777777-7777-4777-8777-777777777777';

const deliveryAddressSnapshot = {
  sourceAddressId: deliveryAddressId,
  recipientName: 'Ashoka',
  contactPhoneNumber: '+919876543210',
  addressLine1: '12 Market Road',
  addressLine2: 'Second Floor',
  landmark: 'Near City Park',
  areaName: 'Central Market',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500001',
  latitude: 17.385,
  longitude: 78.4867,
};

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
  deliveryAddress: deliveryAddressSnapshot,
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
  expectedCart: {
    cartId,
    items: [
      {
        id: cartLineId,
        quantity: 1,
        updatedAt: '2026-08-08T11:59:00Z',
      },
    ],
  },
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
      deliveryAddress: deliveryAddressSnapshot,
      orders: [{orderId, checkoutId, status: 'PAYMENT_PENDING'}],
      createdAt: '2026-08-08T12:00:00Z',
    });
  });

  it('rejects checkout totals whose bill components do not equal the payable total', () => {
    expect(
      parseCheckoutSession({
        ...apiResponse,
        grandTotal: 48.25,
      }),
    ).toBeNull();
  });

  it('accepts exact paise totals without floating-point drift', () => {
    expect(
      parseCheckoutSession({
        ...apiResponse,
        foodSubtotal: 40,
        platformFee: 3.25,
        taxAmount: 2,
        deliveryFee: 3,
        grandTotal: 48.25,
      }),
    ).toMatchObject({
      foodSubtotal: {amount: '40', currency: 'INR'},
      platformFee: {amount: '3.25', currency: 'INR'},
      taxAmount: {amount: '2', currency: 'INR'},
      deliveryFee: {amount: '3', currency: 'INR'},
      grandTotal: {amount: '48.25', currency: 'INR'},
    });
  });

  it('keeps older persisted checkout responses compatible when no address snapshot exists', () => {
    const {deliveryAddress, ...legacyResponse} = apiResponse;
    expect(deliveryAddress).toBe(deliveryAddressSnapshot);
    expect(parseCheckoutSession(legacyResponse)).toMatchObject({
      checkoutId,
      deliveryAddressId,
      deliveryAddress: null,
    });
  });

  it('rejects a checkout whose address snapshot belongs to a different saved address', () => {
    expect(
      parseCheckoutSession({
        ...apiResponse,
        deliveryAddress: {
          ...deliveryAddressSnapshot,
          sourceAddressId: '77777777-7777-4777-8777-777777777777',
        },
      }),
    ).toBeNull();
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

  it('parses the atomic checkout operation receipt', () => {
    const operationId = checkoutOperationIdForIntent(intent);
    expect(
      parseCheckoutOperationResult({
        operationId,
        status: 'SUCCEEDED',
        checkoutId,
      }),
    ).toEqual({operationId, status: 'SUCCEEDED', checkoutId});
  });

  it('derives a stable operation id from the exact server request', () => {
    const original = checkoutOperationIdForIntent(intent);
    expect(
      checkoutOperationIdForIntent({...intent, cartClientRevision: 99}),
    ).toBe(original);
    expect(
      checkoutOperationIdForIntent({
        ...intent,
        expectedCart: {
          ...intent.expectedCart,
          items: [{...intent.expectedCart.items[0], quantity: 2}],
        },
      }),
    ).not.toBe(original);
  });

  it('coalesces duplicate create taps and reuses the successful session for the same intent', async () => {
    const operation = deferred<{
      operationId: string;
      status: 'SUCCEEDED';
      checkoutId: string;
    }>();
    const client = {
      executeOperation: jest.fn(() => operation.promise),
      getOperation: jest.fn(),
      getSession: jest.fn(async () => session),
    };
    const coordinator = createCheckoutSessionCoordinator(client);

    const first = coordinator.create(intent);
    const duplicate = coordinator.create(intent);

    expect(duplicate).toBe(first);
    expect(client.executeOperation).toHaveBeenCalledTimes(1);

    const operationId = checkoutOperationIdForIntent(intent);
    operation.resolve({operationId, status: 'SUCCEEDED', checkoutId});
    await expect(first).resolves.toBe(session);
    await expect(coordinator.create(intent)).resolves.toBe(session);
    expect(client.executeOperation).toHaveBeenCalledTimes(1);
    expect(client.getSession).toHaveBeenCalledWith(checkoutId);
  });

  it('blocks a different checkout request while creation is already in flight', async () => {
    const operation = deferred<{
      operationId: string;
      status: 'SUCCEEDED';
      checkoutId: string;
    }>();
    const client = {
      executeOperation: jest.fn(() => operation.promise),
      getOperation: jest.fn(),
      getSession: jest.fn(async () => session),
    };
    const coordinator = createCheckoutSessionCoordinator(client);

    const first = coordinator.create(intent);
    await expect(
      coordinator.create({
        ...intent,
        expectedCart: {
          ...intent.expectedCart,
          items: [{...intent.expectedCart.items[0], quantity: 2}],
        },
      }),
    ).rejects.toMatchObject({code: 'CHECKOUT_CREATION_IN_PROGRESS'});

    const operationId = checkoutOperationIdForIntent(intent);
    operation.resolve({operationId, status: 'SUCCEEDED', checkoutId});
    await expect(first).resolves.toBe(session);
  });

  it('recovers the original checkout after an uncertain POST outcome', async () => {
    const operationId = checkoutOperationIdForIntent(intent);
    const networkError = new AppApiError(
      'NETWORK_ERROR',
      'We could not reach Craves. Check your connection and try again.',
      undefined,
      undefined,
      true,
    );
    const client = {
      executeOperation: jest.fn(async () => {
        throw networkError;
      }),
      getOperation: jest.fn(async () => ({
        operationId,
        status: 'SUCCEEDED' as const,
        checkoutId,
      })),
      getSession: jest.fn(async () => session),
    };
    const coordinator = createCheckoutSessionCoordinator(client);

    await expect(coordinator.create(intent)).resolves.toBe(session);
    expect(client.executeOperation).toHaveBeenCalledTimes(1);
    expect(client.getOperation).toHaveBeenCalledWith(operationId);
    expect(client.getSession).toHaveBeenCalledWith(checkoutId);
  });

  it('safely replays the same operation when the recovery read races the POST', async () => {
    const operationId = checkoutOperationIdForIntent(intent);
    const networkError = new AppApiError(
      'NETWORK_ERROR',
      'Temporary network failure.',
      undefined,
      undefined,
      true,
    );
    const client = {
      executeOperation: jest
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          operationId,
          status: 'SUCCEEDED' as const,
          checkoutId,
        }),
      getOperation: jest.fn(async () => {
        throw new AppApiError(
          'CHECKOUT_OPERATION_NOT_FOUND',
          'Checkout attempt is not available yet.',
          404,
        );
      }),
      getSession: jest.fn(async () => session),
    };
    const coordinator = createCheckoutSessionCoordinator(client);

    await expect(coordinator.create(intent)).resolves.toBe(session);
    expect(client.executeOperation).toHaveBeenCalledTimes(2);
    expect(client.getOperation).toHaveBeenCalledTimes(1);
  });

  it('does not run recovery for a definitive client rejection', async () => {
    const client = {
      executeOperation: jest.fn(async () => {
        throw new AppApiError(
          'DELIVERY_ADDRESS_REQUIRED',
          'Choose a delivery address.',
          400,
        );
      }),
      getOperation: jest.fn(),
      getSession: jest.fn(),
    };
    const coordinator = createCheckoutSessionCoordinator(client);

    await expect(coordinator.create(intent)).rejects.toMatchObject({
      code: 'DELIVERY_ADDRESS_REQUIRED',
    });
    await expect(coordinator.create(intent)).rejects.toMatchObject({
      code: 'DELIVERY_ADDRESS_REQUIRED',
    });
    expect(client.executeOperation).toHaveBeenCalledTimes(2);
    expect(client.getOperation).not.toHaveBeenCalled();
  });

  it('records the server idempotency contract as active', () => {
    expect(checkoutSessionCapability).toEqual({
      authoritativeCreationSupported: true,
      authoritativeRevalidationOwnedByServer: true,
      clientDuplicateTapCoalescing: true,
      serverIdempotencySupported: true,
      automaticCreateRetrySupported: true,
      blockerCode: null,
    });
  });
});
