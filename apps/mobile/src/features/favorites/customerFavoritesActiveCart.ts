import {safeArea, spacing, touchTarget} from '../../design/tokens';

/**
 * P61 keeps the active View Cart control clear of the final Favorites content.
 * The inset disappears with the overlay so the shared P60 Favorites route
 * returns to its empty-cart spacing immediately when the authoritative cart
 * becomes empty.
 */
export const CUSTOMER_FAVORITES_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveCustomerFavoritesContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible ? CUSTOMER_FAVORITES_VIEW_CART_CONTENT_CLEARANCE : 0;
}
