import type {CustomerDishDetail} from './api/dishDetailApi';

export type DishCartRevalidation =
  | {status: 'READY'}
  | {status: 'PRICE_CHANGED'; message: string}
  | {status: 'BLOCKED'; message: string};

export function formatDishDetailPrice(amount: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency === 'INR') {
    return `₹${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
  return `${normalizedCurrency} ${amount.toFixed(2)}`;
}

/**
 * P40 refreshes the authoritative catalog detail immediately before an add or
 * quantity increase. A price change is intentionally surfaced before mutating
 * the cart so the customer can review the new amount and confirm again.
 */
export function evaluateDishCartRevalidation(
  previous: CustomerDishDetail,
  refreshed: CustomerDishDetail,
): DishCartRevalidation {
  if (previous.id !== refreshed.id || previous.kitchen.id !== refreshed.kitchen.id) {
    return {
      status: 'BLOCKED',
      message: 'This dish changed and could not be verified. Go back and open it again.',
    };
  }

  if (!refreshed.availability.available || refreshed.availability.status !== 'ACTIVE') {
    return {
      status: 'BLOCKED',
      message: 'This dish is no longer available.',
    };
  }

  if (
    previous.price.amount !== refreshed.price.amount ||
    previous.price.currency !== refreshed.price.currency
  ) {
    return {
      status: 'PRICE_CHANGED',
      message: `The price changed to ${formatDishDetailPrice(
        refreshed.price.amount,
        refreshed.price.currency,
      )}. Review the new price and try again.`,
    };
  }

  return {status: 'READY'};
}
