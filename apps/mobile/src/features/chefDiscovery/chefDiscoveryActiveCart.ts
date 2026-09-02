import {safeArea, spacing, touchTarget} from '../../design/tokens';

/**
 * The fixed customer bottom navigation must never cover the final discovery
 * card. Keep a small end gap even when the floating View Cart action is absent.
 */
export const CHEF_DISCOVERY_BOTTOM_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveChefDiscoveryContentBottomInset(
  _viewCartVisible: boolean,
): number {
  return CHEF_DISCOVERY_BOTTOM_CONTENT_CLEARANCE;
}
