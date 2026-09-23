import {
  getCartCheckoutActionLabel,
  isCartLineInteractionDisabled,
  recoveredCheckoutMatchesCurrentCart,
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

  it('does not reuse a recovered checkout for a newer or differently-priced cart', () => {
    const checkout = {
      foodSubtotal: {amount: '48.25', currency: 'INR'},
      createdAt: '2026-09-23T10:00:00Z',
    };
    const baseSnapshot = {
      cartId: '11111111-1111-4111-8111-111111111111',
      currency: 'INR',
      totals: {foodSubtotal: {amount: '48.25', currency: 'INR'}},
      lines: [
        {
          lineId: '22222222-2222-4222-8222-222222222222',
          menuItemId: '33333333-3333-4333-8333-333333333333',
          kitchenId: '44444444-4444-4444-8444-444444444444',
          itemName: 'Meal',
          kitchenName: 'Kitchen',
          unitPrice: {amount: '48.25', currency: 'INR'},
          quantity: 1,
          lineTotal: {amount: '48.25', currency: 'INR'},
          createdAt: '2026-09-23T09:58:00Z',
          updatedAt: '2026-09-23T09:59:00Z',
        },
      ],
    };

    expect(recoveredCheckoutMatchesCurrentCart(checkout, baseSnapshot)).toBe(true);
    expect(
      recoveredCheckoutMatchesCurrentCart(checkout, {
        ...baseSnapshot,
        totals: {foodSubtotal: {amount: '120', currency: 'INR'}},
      }),
    ).toBe(false);
    expect(
      recoveredCheckoutMatchesCurrentCart(checkout, {
        ...baseSnapshot,
        lines: [
          {
            ...baseSnapshot.lines[0],
            createdAt: '2026-09-23T10:01:00Z',
            updatedAt: '2026-09-23T10:01:00Z',
          },
        ],
      }),
    ).toBe(false);
  });

  it('uses an explicit continuation label for a recovered pending payment', () => {
    expect(getCartCheckoutActionLabel(false, false)).toBe('Proceed to Checkout');
    expect(getCartCheckoutActionLabel(false, true)).toBe('Continue payment');
    expect(getCartCheckoutActionLabel(false, true, true)).toBe(
      'Check previous payment',
    );
    expect(getCartCheckoutActionLabel(true, true, true)).toBe('Please wait…');
  });
});
