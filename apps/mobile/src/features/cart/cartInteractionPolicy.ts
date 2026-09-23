import type {CheckoutSession} from '../checkout/domain/checkoutTypes';
import type {CartSnapshot} from './domain/cartTypes';

export interface CartLineInteractionState {
  checkoutBusy: boolean;
  lineMutationPending: boolean;
  paymentRecoveryActive: boolean;
}

/**
 * A recovered/pending payment must not disable unrelated cart editing controls.
 * Only an active checkout transition or the specific line mutation may block taps.
 */
export function isCartLineInteractionDisabled(
  state: CartLineInteractionState,
): boolean {
  return state.checkoutBusy || state.lineMutationPending;
}

function canonicalDecimal(value: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [wholeRaw, fractionalRaw = ''] = value.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fractional = fractionalRaw.replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : whole;
}

export function recoveredCheckoutMatchesCurrentCart(
  checkout: Pick<CheckoutSession, 'foodSubtotal' | 'createdAt'>,
  snapshot: CartSnapshot | null,
): boolean {
  if (!snapshot || snapshot.lines.length === 0) return true;
  if (
    checkout.foodSubtotal.currency !== snapshot.totals.foodSubtotal.currency ||
    canonicalDecimal(checkout.foodSubtotal.amount) === null ||
    canonicalDecimal(checkout.foodSubtotal.amount) !==
      canonicalDecimal(snapshot.totals.foodSubtotal.amount)
  ) {
    return false;
  }

  const checkoutCreatedAt = Date.parse(checkout.createdAt);
  if (Number.isNaN(checkoutCreatedAt)) return false;

  return snapshot.lines.every(line => {
    const createdAt = Date.parse(line.createdAt);
    const updatedAt = Date.parse(line.updatedAt);
    return (
      !Number.isNaN(createdAt) &&
      !Number.isNaN(updatedAt) &&
      createdAt <= checkoutCreatedAt &&
      updatedAt <= checkoutCreatedAt
    );
  });
}

export function getCartCheckoutActionLabel(
  checkoutBusy: boolean,
  paymentRecoveryActive: boolean,
  staleRecoveredCheckout = false,
): string {
  if (checkoutBusy) return 'Please wait…';
  if (staleRecoveredCheckout) return 'Check previous payment';
  if (paymentRecoveryActive) return 'Continue payment';
  return 'Proceed to Checkout';
}
