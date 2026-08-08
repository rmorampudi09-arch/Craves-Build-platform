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
  it('shows View Cart for an active cart on Orders', () => {
    expect(isViewCartOverlayVisible({itemCount: 2, subtotal}, ordersRoutePolicy)).toBe(true);
  });

  it('adds and removes the active-cart bottom clearance', () => {
    expect(resolveCustomerOrdersContentBottomInset(true)).toBe(
      CUSTOMER_ORDERS_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(resolveCustomerOrdersContentBottomInset(false)).toBe(0);
  });

  it('hides View Cart when the cart becomes empty', () => {
    expect(isViewCartOverlayVisible({itemCount: 0, subtotal}, ordersRoutePolicy)).toBe(false);
  });
});
