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
 * P47 keeps saved-address selection separate from quote orchestration. Selecting
 * a different authoritative saved address makes the existing delivery quote
 * stale; P48 owns the exact quote/reprice request that resolves that state.
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
    deliveryQuoteStatus: changed ? 'STALE' : currentDeliveryQuoteStatus,
  };
}
