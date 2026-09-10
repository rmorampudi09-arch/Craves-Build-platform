import {
  resolveRouteChromePolicy,
  type RouteChromePolicy,
} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from './domain/cartTypes';
import {formatCartMoney, isViewCartOverlayVisible} from './viewCartOverlayModel';

const subtotal: CartMoney = {amount: '251', currency: 'INR'};
const standaloneCartPolicy: RouteChromePolicy = {
  bottomNavigationVisible: false,
  viewCartEligible: true,
  immersive: false,
};

describe('P29 shared View Cart overlay model', () => {
  it('stays hidden when the authoritative cart item count is zero', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 0, subtotal},
        standaloneCartPolicy,
      ),
    ).toBe(false);
  });

  it('leaves a non-empty customer cart to the visible bottom navigation', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 2, subtotal},
        resolveRouteChromePolicy('Customer'),
      ),
    ).toBe(false);
  });

  it('can render only when an eligible surface has no bottom navigation', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 2, subtotal},
        standaloneCartPolicy,
      ),
    ).toBe(true);
  });

  it.each(['Auth', 'Chef', 'Transactional', 'Modal'] as const)(
    'is suppressed in the %s navigation domain',
    domain => {
      expect(
        isViewCartOverlayVisible(
          {itemCount: 2, subtotal},
          resolveRouteChromePolicy(domain),
        ),
      ).toBe(false);
    },
  );

  it('requires an authoritative subtotal before rendering', () => {
    expect(
      isViewCartOverlayVisible(
        {itemCount: 2, subtotal: null},
        standaloneCartPolicy,
      ),
    ).toBe(false);
  });

  it('formats server money without calculating a replacement total', () => {
    const formatted = formatCartMoney(subtotal);
    expect(formatted).toContain('251');
  });
});
