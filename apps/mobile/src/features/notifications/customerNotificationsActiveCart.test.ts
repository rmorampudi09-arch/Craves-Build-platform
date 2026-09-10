import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_NOTIFICATIONS_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerNotificationsContentBottomInset,
} from './customerNotificationsActiveCart';

const subtotal: CartMoney = {amount: '480', currency: 'INR'};
const notificationsRoutePolicy = resolveRouteChromePolicy(
  'Customer',
  'CustomerNotifications',
);

describe('P63 Notifications active-cart chrome', () => {
  it('keeps the detached View Cart overlay suppressed while bottom navigation owns the active cart action', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 2, subtotal},
        notificationsRoutePolicy,
      ),
    ).toBe(false);
  });

  it('adds and removes active-cart bottom clearance deterministically', () => {
    expect(resolveCustomerNotificationsContentBottomInset(true)).toBe(
      CUSTOMER_NOTIFICATIONS_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(resolveCustomerNotificationsContentBottomInset(false)).toBe(0);
  });

  it('returns to the P62 empty-cart state when the cart becomes empty', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 0, subtotal},
        notificationsRoutePolicy,
      ),
    ).toBe(false);
  });
});
