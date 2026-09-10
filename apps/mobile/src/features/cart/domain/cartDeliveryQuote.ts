import type {CartDependencyStatus, CartSnapshot} from './cartTypes';

export type CartDeliveryQuoteInvalidationReason =
  | 'ADDRESS_CHANGED'
  | 'CART_CHANGED'
  | 'COUPON_CHANGED';

export const CART_DELIVERY_QUOTE_CONTRACT_BLOCKER =
  'DELIVERY_QUOTE_CONTRACT_UNAVAILABLE' as const;

export interface CartDeliveryQuoteReadiness {
  status: CartDependencyStatus;
  refreshRequired: boolean;
  usableForCheckout: boolean;
  refreshSupported: false;
  blockerCode: typeof CART_DELIVERY_QUOTE_CONTRACT_BLOCKER;
}

/**
 * P48 orchestration boundary. A quote can only remain meaningful while the
 * server-owned cart, selected delivery address, and coupon inputs stay the
 * same. The repository currently has no exact address-aware delivery quote /
 * reprice contract, so invalidation is modeled without inventing a request.
 */
export function invalidateCartDeliveryQuote(
  currentStatus: CartDependencyStatus,
  hasDeliveryAddress: boolean,
  _reason: CartDeliveryQuoteInvalidationReason,
): CartDependencyStatus {
  if (!hasDeliveryAddress) {
    return 'UNRESOLVED';
  }

  if (currentStatus === 'STALE') {
    return currentStatus;
  }

  return 'STALE';
}

export function getCartDeliveryQuoteReadiness(
  status: CartDependencyStatus,
): CartDeliveryQuoteReadiness {
  return {
    status,
    refreshRequired: status !== 'CURRENT',
    usableForCheckout: false,
    refreshSupported: false,
    blockerCode: CART_DELIVERY_QUOTE_CONTRACT_BLOCKER,
  };
}

function moneyEquals(
  left: {amount: string; currency: string},
  right: {amount: string; currency: string},
): boolean {
  return left.amount === right.amount && left.currency === right.currency;
}

/**
 * Detect server cart changes that invalidate a quote while intentionally
 * ignoring created/updated timestamps. Quote inputs are line identity,
 * quantity and authoritative money values, not transport timestamps.
 */
export function cartSnapshotsRequireQuoteRefresh(
  previous: CartSnapshot | null,
  next: CartSnapshot,
): boolean {
  if (!previous) {
    return next.lines.length > 0;
  }

  if (
    previous.cartId !== next.cartId ||
    previous.currency !== next.currency ||
    previous.lines.length !== next.lines.length ||
    !moneyEquals(previous.totals.foodSubtotal, next.totals.foodSubtotal)
  ) {
    return true;
  }

  return previous.lines.some((line, index) => {
    const nextLine = next.lines[index];
    return (
      !nextLine ||
      line.lineId !== nextLine.lineId ||
      line.menuItemId !== nextLine.menuItemId ||
      line.kitchenId !== nextLine.kitchenId ||
      line.quantity !== nextLine.quantity ||
      !moneyEquals(line.unitPrice, nextLine.unitPrice) ||
      !moneyEquals(line.lineTotal, nextLine.lineTotal)
    );
  });
}
