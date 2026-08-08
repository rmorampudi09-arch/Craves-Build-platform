import {buildCustomerPaymentMethodsModel} from './domain/paymentMethodTypes';

describe('P68 payment methods model', () => {
  it('keeps empty-cart browsing free of checkout selection assumptions', () => {
    const model = buildCustomerPaymentMethodsModel({
      cartItemCount: 0,
      selectedMethodId: 'CASHFREE_ONLINE',
    });

    expect(model.mode).toBe('EMPTY_CART');
    expect(model.selectedMethodId).toBeNull();
    expect(model.savedMethodsSupported).toBe(false);
    expect(model.options.find(option => option.id === 'CASHFREE_ONLINE')).toMatchObject({
      availability: 'BLOCKED',
      selected: false,
    });
  });

  it('allows the real Cashfree route to be selected for an active cart', () => {
    const model = buildCustomerPaymentMethodsModel({
      cartItemCount: 3,
      selectedMethodId: 'CASHFREE_ONLINE',
    });

    expect(model.mode).toBe('ACTIVE_CART');
    expect(model.selectedMethodId).toBe('CASHFREE_ONLINE');
    expect(model.options.find(option => option.id === 'CASHFREE_ONLINE')).toMatchObject({
      availability: 'AVAILABLE',
      selected: true,
      channels: ['Cards', 'UPI', 'Wallets', 'Net banking'],
    });
  });

  it('does not fabricate COD eligibility without an authoritative contract', () => {
    const model = buildCustomerPaymentMethodsModel({
      cartItemCount: 2,
      selectedMethodId: null,
    });
    const cod = model.options.find(option => option.id === 'COD');

    expect(cod?.availability).toBe('BLOCKED');
    expect(cod?.blockerReason).toContain('not exposed');
  });
});
