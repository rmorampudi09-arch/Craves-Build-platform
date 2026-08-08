import {
  buildCartScreenModel,
  resolveCartCheckoutState,
  resolveCartQuantityInteraction,
} from './domain/cartScreenModel';
import type {CartDependencies, CartSnapshot} from './domain/cartTypes';
import {selectCartScreenModel} from './state/cartSelectors';
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

const dependencies: CartDependencies = {
  coupon: {status: 'UNRESOLVED'},
  address: {
    status: 'CURRENT',
    addressId: '55555555-5555-4555-8555-555555555555',
  },
  deliveryQuote: {status: 'CURRENT'},
};

describe('P45 cart screen data and pricing model', () => {
  it('reuses authoritative cart items and exposes only the server cart subtotal', () => {
    const model = buildCartScreenModel(snapshot, dependencies);

    expect(model.items).toBe(snapshot.lines);
    expect(model.billSummary.foodSubtotal).toEqual({
      amount: snapshot.totals.foodSubtotal,
      source: 'CART_RESPONSE',
    });
    expect(model.billSummary.platformFee.amount).toBeNull();
    expect(model.billSummary.taxAmount.amount).toBeNull();
    expect(model.billSummary.deliveryFee.amount).toBeNull();
    expect(model.billSummary.couponDiscount.amount).toBeNull();
    expect(model.billSummary.grandTotal.amount).toBeNull();
    expect(model.billSummary.complete).toBe(false);
  });

  it('does not fabricate address, ETA, coupon, pricing, or checkout eligibility from dependency state', () => {
    let cartState = cartReducer(undefined, cartActions.snapshotAccepted(snapshot));
    cartState = cartReducer(
      cartState,
      cartActions.addressDependencyChanged(dependencies.address),
    );
    cartState = cartReducer(
      cartState,
      cartActions.dependencyStatusChanged({
        dependency: 'deliveryQuote',
        status: 'CURRENT',
      }),
    );

    const model = selectCartScreenModel({cart: cartState});

    expect(model?.deliveryAddress).toMatchObject({
      addressId: dependencies.address.addressId,
      status: 'CURRENT',
      summary: null,
      summarySource: 'SERVER_CONTRACT_UNAVAILABLE',
    });
    expect(model?.eta).toMatchObject({
      status: 'CURRENT',
      summary: null,
      summarySource: 'SERVER_CONTRACT_UNAVAILABLE',
    });
    expect(model?.coupon.discount).toEqual({
      amount: null,
      source: 'SERVER_CONTRACT_UNAVAILABLE',
    });
    expect(model?.checkout).toEqual({
      enabled: false,
      status: 'UNAVAILABLE',
      reasonCode: 'SERVER_ELIGIBILITY_UNAVAILABLE',
    });
  });

  it('enables checkout only from explicit server eligibility evidence', () => {
    expect(resolveCartCheckoutState({kind: 'UNAVAILABLE'}).enabled).toBe(false);
    expect(
      resolveCartCheckoutState({
        kind: 'EXPLICIT_SERVER_INELIGIBLE',
        reasonCode: 'ADDRESS_NOT_SERVICEABLE',
      }),
    ).toEqual({
      enabled: false,
      status: 'INELIGIBLE',
      reasonCode: 'ADDRESS_NOT_SERVICEABLE',
    });
    expect(
      resolveCartCheckoutState({kind: 'EXPLICIT_SERVER_ELIGIBLE'}),
    ).toEqual({enabled: true, status: 'ELIGIBLE', reasonCode: null});
  });

  it('maps quantity targets to update, remove, or invalid without sending zero as an update', () => {
    expect(resolveCartQuantityInteraction(3)).toEqual({kind: 'UPDATE', quantity: 3});
    expect(resolveCartQuantityInteraction(0)).toEqual({kind: 'REMOVE'});
    expect(resolveCartQuantityInteraction(-1)).toEqual({kind: 'INVALID'});
    expect(resolveCartQuantityInteraction(1.5)).toEqual({kind: 'INVALID'});
  });
});
