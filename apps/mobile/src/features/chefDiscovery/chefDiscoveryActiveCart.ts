import {safeArea, spacing, touchTarget} from '../../design/tokens';

export const CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export const CHEF_DISCOVERY_BOTTOM_CONTENT_CLEARANCE =
  CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE;

export function resolveChefDiscoveryContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible ? CHEF_DISCOVERY_VIEW_CART_CONTENT_CLEARANCE : 0;
}
