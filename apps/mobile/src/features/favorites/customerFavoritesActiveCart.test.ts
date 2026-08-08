import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_FAVORITES_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerFavoritesContentBottomInset,
} from './customerFavoritesActiveCart';

const subtotal: CartMoney = {amount: '640', currency: 'INR'};
const favoritesRoutePolicy = resolveRouteChromePolicy(
  'Customer',
  'CustomerFavorites',
);

describe('P61 Favorites active-cart chrome', () => {
  it('shows View Cart for an active cart on Favorites', () => {
    expect(
      isViewCartOverlayVisible({itemCount: 2, subtotal}, favoritesRoutePolicy),
    ).toBe(true);
  });

  it('adds and removes the active-cart bottom clearance', () => {
    expect(resolveCustomerFavoritesContentBottomInset(true)).toBe(
      CUSTOMER_FAVORITES_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(resolveCustomerFavoritesContentBottomInset(false)).toBe(0);
  });

  it('returns to the P60 empty-cart state when the cart becomes empty', () => {
    expect(
      isViewCartOverlayVisible({itemCount: 0, subtotal}, favoritesRoutePolicy),
    ).toBe(false);
  });
});
