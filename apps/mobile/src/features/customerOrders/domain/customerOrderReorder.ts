import type {CartSnapshot} from '../../cart/domain/cartTypes';

export type ReorderResult =
  | 'APPLIED'
  | 'CANCELLED'
  | 'STALE'
  | 'BUSY'
  | 'READ_FAILED'
  | 'CART_CHANGED'
  | 'REJECTED'
  | 'UNCERTAIN';

export interface CustomerReorderTarget {
  orderId: string;
  kitchenId: string;
  eligible: boolean;
}

export function reorderCartFingerprint(cart: CartSnapshot): string {
  return JSON.stringify({
    cartId: cart.cartId,
    currency: cart.currency,
    lines: [...cart.lines]
      .sort((a, b) => a.lineId.localeCompare(b.lineId))
      .map(line => ({
        lineId: line.lineId,
        menuItemId: line.menuItemId,
        kitchenId: line.kitchenId,
        itemName: line.itemName,
        kitchenName: line.kitchenName,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        createdAt: line.createdAt,
        updatedAt: line.updatedAt,
      })),
    foodSubtotal: cart.totals.foodSubtotal,
  });
}

export interface CustomerReorderDependencies {
  isCurrent: () => boolean;
  readCart: () => Promise<CartSnapshot | null>;
  confirm: (cart: CartSnapshot) => Promise<boolean>;
  replaceCart: (
    orderId: string,
    expectedSnapshot: CartSnapshot,
    expectedKitchenId: string,
  ) => Promise<'APPLIED' | 'STALE' | 'FAILED' | 'REJECTED'>;
}

/**
 * Reads a fresh cart before consent, reads it again after consent, then sends
 * that exact snapshot to the server's conditional reorder endpoint.
 *
 * Once a write has an ambiguous outcome, automatic retries stay blocked until
 * the customer explicitly reviews a freshly-read cart.
 */
export function createCustomerOrderReorder(
  dependencies: CustomerReorderDependencies,
) {
  let busy = false;
  let uncertain = false;

  return {
    allowRetryAfterCartReview() {
      uncertain = false;
    },

    async run(target: CustomerReorderTarget): Promise<ReorderResult> {
      if (busy || uncertain) return 'BUSY';
      if (!dependencies.isCurrent() || !target.eligible) return 'STALE';

      busy = true;
      let writeStarted = false;
      try {
        const original = await dependencies.readCart();
        if (!dependencies.isCurrent()) return 'STALE';
        if (!original) return 'READ_FAILED';

        const confirmed = await dependencies.confirm(original);
        if (!dependencies.isCurrent()) return 'STALE';
        if (!confirmed) return 'CANCELLED';

        const latest = await dependencies.readCart();
        if (!dependencies.isCurrent()) return 'STALE';
        if (!latest) return 'READ_FAILED';

        if (reorderCartFingerprint(original) !== reorderCartFingerprint(latest)) {
          return 'CART_CHANGED';
        }

        writeStarted = true;
        const result = await dependencies.replaceCart(
          target.orderId,
          latest,
          target.kitchenId,
        );
        if (!dependencies.isCurrent()) return 'STALE';
        if (result === 'STALE') return 'STALE';
        if (result === 'REJECTED') return 'REJECTED';
        if (result === 'FAILED') {
          uncertain = true;
          return 'UNCERTAIN';
        }
        return 'APPLIED';
      } catch {
        if (!dependencies.isCurrent()) return 'STALE';
        if (writeStarted) {
          uncertain = true;
          return 'UNCERTAIN';
        }
        return 'READ_FAILED';
      } finally {
        busy = false;
      }
    },
  };
}
