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
  it('keeps the detached View Cart overlay suppressed while bottom navigation owns the active cart action', () => {
    expect(isViewCartOverlayVisible({itemCount: 2, subtotal}, profileRoutePolicy)).toBe(false);
  });

  it('adds and removes the active-cart bottom clearance deterministically', () => {
    expect(resolveCustomerProfileContentBottomInset(true)).toBe(
      CUSTOMER_PROFILE_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(resolveCustomerProfileContentBottomInset(false)).toBe(0);
  });

  it('returns to the P58 empty-cart state when the cart becomes empty', () => {
    expect(isViewCartOverlayVisible({itemCount: 0, subtotal}, profileRoutePolicy)).toBe(false);
  });
});
