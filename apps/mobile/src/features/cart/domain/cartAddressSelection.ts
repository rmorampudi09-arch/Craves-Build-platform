import {invalidateCartDeliveryQuote} from './cartDeliveryQuote';
import type {
  CartAddressDependency,
  CartDependencyStatus,
} from './cartTypes';

export interface CartAddressSelectionTransition {
  changed: boolean;
  address: CartAddressDependency;
  deliveryQuoteStatus: CartDependencyStatus;
}

/**
 * P47 selects the authoritative saved address. P48 centralizes the dependent
 * quote invalidation rule so address, cart and later coupon changes cannot use
 * different stale-quote semantics.
 */
export function resolveCartAddressSelection(
  currentAddressId: string | null,
  currentDeliveryQuoteStatus: CartDependencyStatus,
  nextAddressId: string,
): CartAddressSelectionTransition {
  const changed = currentAddressId !== nextAddressId;

  return {
    changed,
    address: {
      status: 'CURRENT',
      addressId: nextAddressId,
    },
    deliveryQuoteStatus: changed
      ? invalidateCartDeliveryQuote(
          currentDeliveryQuoteStatus,
          true,
          'ADDRESS_CHANGED',
        )
      : currentDeliveryQuoteStatus,
  };
}
