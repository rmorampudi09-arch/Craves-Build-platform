import {safeArea, spacing, touchTarget} from '../../design/tokens';

/**
 * P36 keeps the floating View Cart action clear of the final discovery row.
 * The inset disappears with the overlay so the empty-cart variant does not
 * retain a dead gap above the customer bottom navigation.
 */
export const CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveChefDiscoveryContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible ? CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE : 0;
}
