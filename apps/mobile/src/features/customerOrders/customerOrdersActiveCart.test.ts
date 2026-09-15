import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_ORDERS_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerOrdersContentBottomInset,
} from './customerOrdersActiveCart';

const subtotal: CartMoney = {amount: '640', currency: 'INR'};
const ordersRoutePolicy = resolveRouteChromePolicy('Customer', 'Orders');

describe('P54 My Orders active-cart chrome', () => {
  it('keeps the detached View Cart overlay suppressed while bottom navigation owns the active cart action', () => {
    expect(isViewCartOverlayVisible({itemCount: 2, subtotal}, ordersRoutePolicy)).toBe(false);
  });

  it('adds and removes the active-cart bottom clearance deterministically', () => {
    expect(resolveCustomerOrdersContentBottomInset(true)).toBe(
      CUSTOMER_ORDERS_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(resolveCustomerOrdersContentBottomInset(false)).toBe(0);
  });

  it('hides detached View Cart when the cart becomes empty', () => {
    expect(isViewCartOverlayVisible({itemCount: 0, subtotal}, ordersRoutePolicy)).toBe(false);
  });
});
