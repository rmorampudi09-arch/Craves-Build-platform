import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_SUPPORT_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerSupportContentBottomInset,
} from './customerSupportActiveCart';

const subtotal: CartMoney = {amount: '480', currency: 'INR'};
const supportRoutePolicy = resolveRouteChromePolicy(
  'Customer',
  'CustomerSettingsSupport',
);

describe('P77 Help & Support active-cart chrome', () => {
  it('shows View Cart for an active cart on Help & Support', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 2, subtotal},
        supportRoutePolicy,
      ),
    ).toBe(true);
  });

  it('adds and removes active-cart bottom clearance', () => {
    expect(resolveCustomerSupportContentBottomInset(true)).toBe(
      CUSTOMER_SUPPORT_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(resolveCustomerSupportContentBottomInset(false)).toBe(0);
  });

  it('returns to the P76 empty-cart state when the cart becomes empty', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 0, subtotal},
        supportRoutePolicy,
      ),
    ).toBe(false);
  });
});
