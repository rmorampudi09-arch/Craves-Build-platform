import type {RouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from './domain/cartTypes';

export interface ViewCartOverlayModel {
  itemCount: number;
  subtotal: CartMoney | null;
}

export function isViewCartOverlayVisible(
  model: ViewCartOverlayModel,
  routePolicy: RouteChromePolicy,
): boolean {
  return (
    routePolicy.viewCartEligible &&
    !routePolicy.bottomNavigationVisible &&
    model.itemCount > 0 &&
    model.subtotal !== null
  );
}

export function formatCartMoney(money: CartMoney): string {
  const numericAmount = Number(money.amount);

  if (!Number.isFinite(numericAmount)) {
    return `${money.currency} ${money.amount}`;
  }

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: money.currency,
    }).format(numericAmount);
  } catch {
    return `${money.currency} ${money.amount}`;
  }
}
