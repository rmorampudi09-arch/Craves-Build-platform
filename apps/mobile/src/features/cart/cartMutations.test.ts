import {store} from '../../app/store/store';
import {AppApiError} from '../../core/http/apiError';
import {cartApi} from './api/cartApi';
import type {CartSnapshot} from './domain/cartTypes';
import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
} from './state/cartMutations';
import {
  selectCartFoodSubtotal,
  selectCartIsEmpty,
  selectCartItemCount,
  selectCartMutation,
} from './state/cartSelectors';
import {cartActions} from './state/cartSlice';

jest.mock('./api/cartApi', () => ({
  cartApi: {
    getSnapshot: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const addItemMock = cartApi.addItem as jest.Mock;
const updateItemMock = cartApi.updateItem as jest.Mock;
const removeItemMock = cartApi.removeItem as jest.Mock;

const LINE_ID = '22222222-2222-4222-8222-222222222222';
const MENU_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_MENU_ITEM_ID = '55555555-5555-4555-8555-555555555555';

const initialSnapshot: CartSnapshot = {
  cartId: '11111111-1111-4111-8111-111111111111',
  currency: 'INR',
  lines: [
    {
      lineId: LINE_ID,
      menuItemId: MENU_ITEM_ID,
      kitchenId: '44444444-4444-4444-8444-444444444444',
      itemName: 'Vegetable Biryani',
      kitchenName: 'Ananya Home Kitchen',
      unitPrice: {amount: '125.5', currency: 'INR'},
      quantity: 2,
      lineTotal: {amount: '251', currency: 'INR'},
      createdAt: '2026-08-08T00:00:00Z',
      updatedAt: '2026-08-08T00:01:00Z',
    },
  ],
  totals: {
    foodSubtotal: {amount: '251', currency: 'INR'},
  },
};

function snapshotWithQuantity(quantity: number, subtotal: string): CartSnapshot {
  return {
    ...initialSnapshot,
    lines: initialSnapshot.lines.map(line => ({
      ...line,
      quantity,
      lineTotal: {amount: subtotal, currency: 'INR'},
      updatedAt: '2026-08-08T00:02:00Z',
    })),
    totals: {foodSubtotal: {amount: subtotal, currency: 'INR'}},
  };
}

function emptySnapshot(): CartSnapshot {
  return {
    ...initialSnapshot,
    lines: [],
    totals: {foodSubtotal: {amount: '0', currency: 'INR'}},
  };
}

function snapshotWithAddedItem(): CartSnapshot {
  return {
    ...initialSnapshot,
    lines: [
      ...initialSnapshot.lines,
      {
        lineId: '66666666-6666-4666-8666-666666666666',
        menuItemId: SECOND_MENU_ITEM_ID,
        kitchenId: '77777777-7777-4777-8777-777777777777',
        itemName: 'Paneer Wrap',
        kitchenName: 'Meera Home Kitchen',
        unitPrice: {amount: '100', currency: 'INR'},
        quantity: 1,
        lineTotal: {amount: '100', currency: 'INR'},
        createdAt: '2026-08-08T00:02:00Z',
        updatedAt: '2026-08-08T00:02:00Z',
      },
    ],
    totals: {foodSubtotal: {amount: '351', currency: 'INR'}},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

describe('P30 cart mutation reconciliation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    store.dispatch(cartActions.resetCartDomain());
    store.dispatch(cartActions.snapshotAccepted(initialSnapshot));
  });

  it('protects duplicate add taps and accepts the server-created line identity', async () => {
    const server = deferred<CartSnapshot>();
    addItemMock.mockReturnValueOnce(server.promise);

    const first = store.dispatch(addCartItem({menuItemId: SECOND_MENU_ITEM_ID, quantity: 1}));
    const duplicate = await store.dispatch(
      addCartItem({menuItemId: SECOND_MENU_ITEM_ID, quantity: 1}),
    );

    expect(duplicate).toEqual({status: 'SKIPPED_DUPLICATE'});
    await Promise.resolve();
    expect(addItemMock).toHaveBeenCalledTimes(1);
    expect(addItemMock).toHaveBeenCalledWith(SECOND_MENU_ITEM_ID, 1);

    const authoritative = snapshotWithAddedItem();
    server.resolve(authoritative);
    const result = await first;

    expect(result.status).toBe('APPLIED');
    expect(selectCartItemCount(store.getState())).toBe(3);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '351',
      currency: 'INR',
    });
    expect(store.getState().cart.snapshot?.lines[1]?.lineId).toBe(
      '66666666-6666-4666-8666-666666666666',
    );
    expect(store.getState().cart.clientRevision).toBe(2);
  });

  it('applies quantity optimistically, keeps server totals authoritative, then reconciles', async () => {
    const server = deferred<CartSnapshot>();
    updateItemMock.mockReturnValueOnce(server.promise);

    const resultPromise = store.dispatch(
      setCartItemQuantity({lineId: LINE_ID, quantity: 3}),
    );
    await Promise.resolve();

    expect(selectCartItemCount(store.getState())).toBe(3);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '251',
      currency: 'INR',
    });
    expect(store.getState().cart.clientRevision).toBe(1);
    expect(selectCartMutation(store.getState(), `line:${LINE_ID}`)?.status).toBe(
      'PENDING',
    );

    server.resolve(snapshotWithQuantity(3, '376.5'));
    const result = await resultPromise;

    expect(result.status).toBe('APPLIED');
    expect(selectCartItemCount(store.getState())).toBe(3);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '376.5',
      currency: 'INR',
    });
    expect(store.getState().cart.clientRevision).toBe(2);
    expect(selectCartMutation(store.getState(), `line:${LINE_ID}`)).toBeNull();
  });

  it('rolls back an optimistic quantity when the authoritative mutation fails', async () => {
    const server = deferred<CartSnapshot>();
    updateItemMock.mockReturnValueOnce(server.promise);

    const resultPromise = store.dispatch(
      setCartItemQuantity({lineId: LINE_ID, quantity: 5}),
    );
    await Promise.resolve();
    expect(selectCartItemCount(store.getState())).toBe(5);

    server.reject(
      new AppApiError(
        'OUT_OF_STOCK',
        'The requested quantity is no longer available.',
        400,
      ),
    );
    const result = await resultPromise;

    expect(result.status).toBe('FAILED');
    expect(result.status === 'FAILED' ? result.error.code : null).toBe('OUT_OF_STOCK');
    expect(selectCartItemCount(store.getState())).toBe(2);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '251',
      currency: 'INR',
    });
    expect(store.getState().cart.clientRevision).toBe(1);
    expect(selectCartMutation(store.getState(), `line:${LINE_ID}`)).toMatchObject({
      status: 'FAILED',
      errorCode: 'OUT_OF_STOCK',
    });
  });

  it('removes the line optimistically so shared empty-cart state reacts immediately', async () => {
    const server = deferred<CartSnapshot>();
    removeItemMock.mockReturnValueOnce(server.promise);

    const resultPromise = store.dispatch(removeCartItem({lineId: LINE_ID}));
    await Promise.resolve();

    expect(selectCartIsEmpty(store.getState())).toBe(true);
    expect(selectCartItemCount(store.getState())).toBe(0);
    expect(store.getState().cart.clientRevision).toBe(1);

    server.resolve(emptySnapshot());
    const result = await resultPromise;

    expect(result.status).toBe('APPLIED');
    expect(selectCartIsEmpty(store.getState())).toBe(true);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '0',
      currency: 'INR',
    });
    expect(store.getState().cart.clientRevision).toBe(2);
  });

  it('serializes different cart writes so older mutation responses cannot overtake newer intent', async () => {
    const addServer = deferred<CartSnapshot>();
    const updateServer = deferred<CartSnapshot>();
    addItemMock.mockReturnValueOnce(addServer.promise);
    updateItemMock.mockReturnValueOnce(updateServer.promise);

    const addPromise = store.dispatch(
      addCartItem({menuItemId: SECOND_MENU_ITEM_ID, quantity: 1}),
    );
    const updatePromise = store.dispatch(
      setCartItemQuantity({lineId: LINE_ID, quantity: 3}),
    );

    await Promise.resolve();
    expect(addItemMock).toHaveBeenCalledTimes(1);
    expect(updateItemMock).not.toHaveBeenCalled();

    addServer.resolve(snapshotWithAddedItem());
    await addPromise;
    await Promise.resolve();

    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(selectCartItemCount(store.getState())).toBe(4);

    const finalSnapshot = snapshotWithAddedItem();
    finalSnapshot.lines[0] = {
      ...finalSnapshot.lines[0],
      quantity: 3,
      lineTotal: {amount: '376.5', currency: 'INR'},
    };
    finalSnapshot.totals = {
      foodSubtotal: {amount: '476.5', currency: 'INR'},
    };
    updateServer.resolve(finalSnapshot);
    await updatePromise;

    expect(selectCartItemCount(store.getState())).toBe(4);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '476.5',
      currency: 'INR',
    });
  });
});
