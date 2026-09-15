import {safeArea, spacing, touchTarget} from '../../design/tokens';

/**
 * P63 keeps the active View Cart control clear of the final Notifications
 * content. The inset disappears with the overlay so the shared P62 route
 * returns immediately to its empty-cart spacing when the cart becomes empty.
 */
export const CUSTOMER_NOTIFICATIONS_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveCustomerNotificationsContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible
    ? CUSTOMER_NOTIFICATIONS_VIEW_CART_CONTENT_CLEARANCE
    : 0;
}
