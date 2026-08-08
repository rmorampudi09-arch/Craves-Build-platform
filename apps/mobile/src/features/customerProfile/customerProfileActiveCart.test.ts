import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_PROFILE_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerProfileContentBottomInset,
} from './customerProfileActiveCart';

const subtotal: CartMoney = {amount: '640', currency: 'INR'};
const profileRoutePolicy = resolveRouteChromePolicy('Customer', 'Profile');

describe('P59 Customer Profile active-cart chrome', () => {
  it('shows View Cart for an active cart on Profile', () => {
    expect(isViewCartOverlayVisible({itemCount: 2, subtotal}, profileRoutePolicy)).toBe(true);
  });

  it('adds and removes the active-cart bottom clearance', () => {
    expect(resolveCustomerProfileContentBottomInset(true)).toBe(
      CUSTOMER_PROFILE_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(resolveCustomerProfileContentBottomInset(false)).toBe(0);
  });

  it('returns to the P58 empty-cart state when the cart becomes empty', () => {
    expect(isViewCartOverlayVisible({itemCount: 0, subtotal}, profileRoutePolicy)).toBe(false);
  });
});
