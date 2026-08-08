import {httpClient} from '../../core/http/httpClient';
import {cartApi, parseCartSnapshot} from './api/cartApi';
import {
  selectCartFoodSubtotal,
  selectCartItemCount,
  selectCartQuantityForMenuItem,
} from './state/cartSelectors';
import {cartActions, cartReducer} from './state/cartSlice';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;

const cartResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  customerIdentityId: '99999999-9999-4999-8999-999999999999',
  currency: 'INR',
  items: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      menuItemId: '33333333-3333-4333-8333-333333333333',
      kitchenId: '44444444-4444-4444-8444-444444444444',
      itemName: 'Vegetable Biryani',
      kitchenName: 'Ananya Home Kitchen',
      unitPrice: 125.5,
      currency: 'INR',
      quantity: 2,
      lineTotal: 251,
      createdAt: '2026-08-08T00:00:00Z',
      updatedAt: '2026-08-08T00:01:00Z',
    },
  ],
  totals: {
    foodSubtotal: 251,
    currency: 'INR',
  },
};

describe('P28 authoritative cart domain', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps the exact cart read contract without retaining customer identity data', async () => {
    getMock.mockResolvedValueOnce(cartResponse);

    const snapshot = await cartApi.getSnapshot();

    expect(getMock).toHaveBeenCalledWith('/api/v1/cart', {
      dedupeKey: 'customer-cart:snapshot',
    });
    expect(snapshot.cartId).toBe(cartResponse.id);
    expect(snapshot.lines[0]).toMatchObject({
      lineId: cartResponse.items[0].id,
      menuItemId: cartResponse.items[0].menuItemId,
      kitchenId: cartResponse.items[0].kitchenId,
      quantity: 2,
      unitPrice: {amount: '125.5', currency: 'INR'},
      lineTotal: {amount: '251', currency: 'INR'},
    });
    expect(snapshot.totals.foodSubtotal).toEqual({amount: '251', currency: 'INR'});
    expect(snapshot).not.toHaveProperty('customerIdentityId');
  });

  it('rejects a cart snapshot with inconsistent server currency', () => {
    expect(
      parseCartSnapshot({
        ...cartResponse,
        totals: {...cartResponse.totals, currency: 'USD'},
      }),
    ).toBeNull();
  });

  it('keeps one snapshot and advances only the client acceptance revision', () => {
    const snapshot = parseCartSnapshot(cartResponse);
    expect(snapshot).not.toBeNull();
    if (!snapshot) {
      return;
    }

    const first = cartReducer(undefined, cartActions.snapshotAccepted(snapshot));
    const second = cartReducer(first, cartActions.snapshotAccepted(snapshot));

    expect(first.clientRevision).toBe(1);
    expect(second.clientRevision).toBe(2);
    expect(second.snapshot).toEqual(snapshot);
  });

  it('derives quantity while returning server subtotal unchanged', () => {
    const snapshot = parseCartSnapshot(cartResponse);
    expect(snapshot).not.toBeNull();
    if (!snapshot) {
      return;
    }

    const state = {
      cart: cartReducer(undefined, cartActions.snapshotAccepted(snapshot)),
    };

    expect(selectCartItemCount(state)).toBe(2);
    expect(selectCartQuantityForMenuItem(state, cartResponse.items[0].menuItemId)).toBe(2);
    expect(selectCartFoodSubtotal(state)).toEqual({amount: '251', currency: 'INR'});
  });

  it('ignores stale mutation completion and keeps dependency state explicit', () => {
    let state = cartReducer(
      undefined,
      cartActions.mutationStarted({
        key: 'line:22222222-2222-4222-8222-222222222222',
        requestId: 'request-new',
        scope: 'LINE',
        targetLineId: '22222222-2222-4222-8222-222222222222',
      }),
    );

    state = cartReducer(
      state,
      cartActions.mutationSucceeded({
        key: 'line:22222222-2222-4222-8222-222222222222',
        requestId: 'request-old',
      }),
    );
    state = cartReducer(
      state,
      cartActions.addressDependencyChanged({
        status: 'CURRENT',
        addressId: '55555555-5555-4555-8555-555555555555',
      }),
    );
    state = cartReducer(
      state,
      cartActions.dependencyStatusChanged({
        dependency: 'deliveryQuote',
        status: 'STALE',
      }),
    );

    expect(state.mutations['line:22222222-2222-4222-8222-222222222222']).toMatchObject({
      requestId: 'request-new',
      status: 'PENDING',
    });
    expect(state.dependencies.address).toEqual({
      status: 'CURRENT',
      addressId: '55555555-5555-4555-8555-555555555555',
    });
    expect(state.dependencies.deliveryQuote.status).toBe('STALE');
  });

  it('clears the complete private cart domain on reset', () => {
    const pending = cartReducer(
      undefined,
      cartActions.mutationStarted({
        key: 'cart',
        requestId: 'request-1',
        scope: 'CART',
      }),
    );

    const reset = cartReducer(pending, cartActions.resetCartDomain());

    expect(reset.snapshot).toBeNull();
    expect(reset.clientRevision).toBe(0);
    expect(reset.mutations).toEqual({});
    expect(reset.dependencies.address.addressId).toBeNull();
  });
});
