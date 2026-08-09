import {safeArea, spacing, touchTarget} from '../../design/tokens';

/**
 * P77 keeps the active View Cart control clear of the final Help & Support
 * content. The inset disappears with the overlay so the shared P76 route
 * returns immediately to its empty-cart spacing when the cart becomes empty.
 */
export const CUSTOMER_SUPPORT_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveCustomerSupportContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible ? CUSTOMER_SUPPORT_VIEW_CART_CONTENT_CLEARANCE : 0;
}
