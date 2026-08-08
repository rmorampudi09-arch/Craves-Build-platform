import {safeArea, spacing, touchTarget} from '../../design/tokens';

/**
 * P59 keeps the active View Cart control clear of the final Profile content.
 * The inset disappears with the overlay so the shared P58 Profile route returns
 * to its empty-cart spacing immediately when the authoritative cart empties.
 */
export const CUSTOMER_PROFILE_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveCustomerProfileContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible ? CUSTOMER_PROFILE_VIEW_CART_CONTENT_CLEARANCE : 0;
}
