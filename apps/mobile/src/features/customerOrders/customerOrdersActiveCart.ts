import {safeArea, spacing, touchTarget} from '../../design/tokens';

/**
 * P54 keeps the active View Cart control clear of the final Orders row.
 * The inset disappears immediately with the overlay so the empty-cart state
 * keeps the P53 spacing and does not retain a dead gap above bottom navigation.
 */
export const CUSTOMER_ORDERS_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveCustomerOrdersContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible ? CUSTOMER_ORDERS_VIEW_CART_CONTENT_CLEARANCE : 0;
}
