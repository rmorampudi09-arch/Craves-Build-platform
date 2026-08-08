import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE,
  resolveChefDiscoveryContentBottomInset,
} from './chefDiscoveryActiveCart';

const subtotal: CartMoney = {amount: '420', currency: 'INR'};
const chefsRoutePolicy = resolveRouteChromePolicy('Customer', 'Chefs');

describe('P36 Discover Home Chefs active-cart chrome', () => {
  it('keeps View Cart eligible on the customer Chefs tab for an authoritative active cart', () => {
    expect(
      isViewCartOverlayVisible({itemCount: 3, subtotal}, chefsRoutePolicy),
    ).toBe(true);
  });

  it('reserves content clearance while View Cart is visible', () => {
    expect(resolveChefDiscoveryContentBottomInset(true)).toBe(
      CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE).toBeGreaterThan(0);
  });

  it('removes the extra inset as soon as the cart becomes empty', () => {
    expect(
      isViewCartOverlayVisible({itemCount: 0, subtotal}, chefsRoutePolicy),
    ).toBe(false);
    expect(resolveChefDiscoveryContentBottomInset(false)).toBe(0);
  });
});
