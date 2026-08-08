import {
  CART_DELIVERY_QUOTE_CONTRACT_BLOCKER,
  cartSnapshotsRequireQuoteRefresh,
  getCartDeliveryQuoteReadiness,
  invalidateCartDeliveryQuote,
} from './domain/cartDeliveryQuote';
import type {CartSnapshot} from './domain/cartTypes';
import {cartActions, cartReducer} from './state/cartSlice';

const snapshot: CartSnapshot = {
  cartId: '11111111-1111-4111-8111-111111111111',
  currency: 'INR',
  lines: [
    {
      lineId: '22222222-2222-4222-8222-222222222222',
      menuItemId: '33333333-3333-4333-8333-333333333333',
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

function withQuantity(quantity: number): CartSnapshot {
  return {
    ...snapshot,
    lines: snapshot.lines.map(line => ({
      ...line,
      quantity,
      lineTotal: {amount: String(125.5 * quantity), currency: 'INR'},
    })),
    totals: {
      foodSubtotal: {amount: String(125.5 * quantity), currency: 'INR'},
    },
  };
}

describe('P48 delivery quote/reprice orchestration', () => {
  it('keeps quote unresolved without an address and marks it stale once quote inputs can be addressed', () => {
    expect(invalidateCartDeliveryQuote('CURRENT', false, 'CART_CHANGED')).toBe(
      'UNRESOLVED',
    );
    expect(invalidateCartDeliveryQuote('CURRENT', true, 'CART_CHANGED')).toBe(
      'STALE',
    );
    expect(invalidateCartDeliveryQuote('ERROR', true, 'COUPON_CHANGED')).toBe(
      'STALE',
    );
  });

  it('detects quote-relevant cart changes but ignores transport timestamp-only changes', () => {
    expect(cartSnapshotsRequireQuoteRefresh(snapshot, withQuantity(3))).toBe(true);
    expect(
      cartSnapshotsRequireQuoteRefresh(snapshot, {
        ...snapshot,
        lines: snapshot.lines.map(line => ({
          ...line,
          updatedAt: '2026-08-08T00:10:00Z',
        })),
      }),
    ).toBe(false);
  });

  it('invalidates a current quote when an authoritative cart snapshot changes', () => {
    let state = cartReducer(undefined, cartActions.snapshotAccepted(snapshot));
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
        status: 'CURRENT',
      }),
    );

    state = cartReducer(state, cartActions.snapshotAccepted(withQuantity(3)));

    expect(state.dependencies.deliveryQuote.status).toBe('STALE');
  });

  it('fails closed while the exact delivery quote contract is unavailable', () => {
    expect(getCartDeliveryQuoteReadiness('STALE')).toEqual({
      status: 'STALE',
      refreshRequired: true,
      usableForCheckout: false,
      refreshSupported: false,
      blockerCode: CART_DELIVERY_QUOTE_CONTRACT_BLOCKER,
    });
    expect(getCartDeliveryQuoteReadiness('CURRENT').usableForCheckout).toBe(false);
  });
});
