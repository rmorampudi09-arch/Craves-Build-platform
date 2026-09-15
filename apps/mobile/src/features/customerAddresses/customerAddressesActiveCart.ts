import {safeArea, spacing, touchTarget} from '../../design/tokens';

export const CUSTOMER_ADDRESSES_VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

export function resolveCustomerAddressesContentBottomInset(
  viewCartVisible: boolean,
): number {
  return viewCartVisible ? CUSTOMER_ADDRESSES_VIEW_CART_CONTENT_CLEARANCE : 0;
}
