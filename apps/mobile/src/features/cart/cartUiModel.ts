import type {
  CartCheckoutStateModel,
  CartDeliveryAddressSummaryModel,
  CartEtaSummaryModel,
  CartScreenItem,
} from './domain/cartScreenModel';

export interface CartKitchenSectionModel {
  key: string;
  kitchenId: string;
  kitchenName: string;
  data: CartScreenItem[];
}

/** Preserve authoritative server line order while grouping repeated kitchens. */
export function groupCartItemsByKitchen(
  items: readonly CartScreenItem[],
): CartKitchenSectionModel[] {
  const groups = new Map<string, CartKitchenSectionModel>();

  for (const item of items) {
    const existing = groups.get(item.kitchenId);
    if (existing) {
      existing.data.push(item);
      continue;
    }

    groups.set(item.kitchenId, {
      key: item.kitchenId,
      kitchenId: item.kitchenId,
      kitchenName: item.kitchenName,
      data: [item],
    });
  }

  return Array.from(groups.values());
}

export function getCartAddressStatusCopy(
  address: CartDeliveryAddressSummaryModel,
): string {
  if (!address.addressId) {
    return 'No delivery address is confirmed for this cart.';
  }

  if (address.status === 'CURRENT' && address.summary) {
    return address.summary;
  }

  return 'A delivery address is linked, but Craves cannot verify its display details yet.';
}

export function getCartEtaStatusCopy(eta: CartEtaSummaryModel): string {
  if (eta.status === 'CURRENT' && eta.summary) {
    return eta.summary;
  }

  return 'Delivery estimate will appear after the server verifies the address and quote.';
}

export function getCartCheckoutStatusCopy(
  checkout: CartCheckoutStateModel,
  billComplete: boolean,
): string {
  if (!billComplete) {
    return 'Checkout is unavailable until Craves can verify the complete bill, fees and taxes.';
  }

  if (checkout.status === 'INELIGIBLE') {
    return 'This cart is not eligible for checkout yet. Refresh the cart and review the required details.';
  }

  if (checkout.status === 'UNAVAILABLE') {
    return 'Checkout eligibility could not be verified. Refresh the cart before continuing.';
  }

  return 'Your cart is ready for checkout.';
}

export function getCartItemInitial(itemName: string): string {
  const normalized = itemName.trim();
  return normalized ? normalized.slice(0, 1).toUpperCase() : 'C';
}
