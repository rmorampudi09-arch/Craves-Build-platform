import {
  getCartCheckoutActionLabel,
  isCartLineInteractionDisabled,
} from './cartInteractionPolicy';

describe('cartInteractionPolicy', () => {
  it('keeps line controls enabled for a genuine pending payment', () => {
    expect(
      isCartLineInteractionDisabled({
        checkoutBusy: false,
        lineMutationPending: false,
        paymentRecoveryActive: true,
      }),
    ).toBe(false);
  });

  it('blocks only while checkout is transitioning or the line is mutating', () => {
    expect(
      isCartLineInteractionDisabled({
        checkoutBusy: true,
        lineMutationPending: false,
        paymentRecoveryActive: false,
      }),
    ).toBe(true);
    expect(
      isCartLineInteractionDisabled({
        checkoutBusy: false,
        lineMutationPending: true,
        paymentRecoveryActive: true,
      }),
    ).toBe(true);
  });

  it('uses an explicit continuation label for a recovered pending payment', () => {
    expect(getCartCheckoutActionLabel(false, false)).toBe('Proceed to Checkout');
    expect(getCartCheckoutActionLabel(false, true)).toBe('Continue payment');
    expect(getCartCheckoutActionLabel(true, true)).toBe('Please wait…');
  });
});
