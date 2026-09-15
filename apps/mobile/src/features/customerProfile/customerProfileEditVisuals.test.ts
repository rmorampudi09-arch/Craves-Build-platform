import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_PROFILE_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerProfileContentBottomInset,
} from './customerProfileActiveCart';

const subtotal: CartMoney = {amount: '640', currency: 'INR'};
const editRoutePolicy = resolveRouteChromePolicy('Customer', 'CustomerProfileEdit');

describe('P65 Edit Customer Profile active/empty visuals', () => {
  it('suppresses the detached View Cart CTA because active cart is integrated into bottom navigation', () => {
    expect(isViewCartOverlayVisible({itemCount: 2, subtotal}, editRoutePolicy)).toBe(false);
    expect(resolveCustomerProfileContentBottomInset(true)).toBe(
      CUSTOMER_PROFILE_VIEW_CART_CONTENT_CLEARANCE,
    );
  });

  it('omits View Cart and extra clearance for reference 24 when cart state is empty', () => {
    expect(isViewCartOverlayVisible({itemCount: 0, subtotal}, editRoutePolicy)).toBe(false);
    expect(resolveCustomerProfileContentBottomInset(false)).toBe(0);
  });

  it('uses standard customer chrome rather than creating a second edit-flow policy', () => {
    expect(editRoutePolicy).toEqual({
      bottomNavigationVisible: true,
      viewCartEligible: true,
      immersive: false,
    });
  });
});
