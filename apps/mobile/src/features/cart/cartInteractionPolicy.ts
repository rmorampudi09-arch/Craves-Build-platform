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

export function getCartCheckoutActionLabel(
  checkoutBusy: boolean,
  paymentRecoveryActive: boolean,
): string {
  if (checkoutBusy) return 'Please wait…';
  if (paymentRecoveryActive) return 'Continue payment';
  return 'Proceed to Checkout';
}
