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

  it('does not infer online eligibility from an active cart alone', () => {
    const model = buildCustomerPaymentMethodsModel({
      cartItemCount: 3,
      selectedMethodId: 'CASHFREE_ONLINE',
    });
    const online = model.options.find(option => option.id === 'CASHFREE_ONLINE');

    expect(model.mode).toBe('ACTIVE_CART');
    expect(model.selectedMethodId).toBeNull();
    expect(online).toMatchObject({
      availability: 'BLOCKED',
      selected: false,
      channels: ['Cards', 'UPI', 'Wallets', 'Net banking'],
    });
    expect(online?.blockerReason).toContain('not exposed');
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
