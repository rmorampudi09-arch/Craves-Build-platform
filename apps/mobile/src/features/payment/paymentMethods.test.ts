import {buildCustomerPaymentMethodsModel} from './domain/paymentMethodTypes';

describe('production payment methods model', () => {
  it('keeps empty-cart browsing free of checkout selection assumptions', () => {
    const model = buildCustomerPaymentMethodsModel({
      cartItemCount: 0,
      selectedMethodId: 'RAZORPAY_ONLINE',
    });

    expect(model.mode).toBe('EMPTY_CART');
    expect(model.selectedMethodId).toBeNull();
    expect(model.savedMethodsSupported).toBe(false);
    expect(model.options.find(option => option.id === 'RAZORPAY_ONLINE')).toMatchObject({
      availability: 'BLOCKED',
      selected: false,
    });
  });

  it('directs online payment to the authoritative Cart Razorpay flow', () => {
    const model = buildCustomerPaymentMethodsModel({
      cartItemCount: 3,
      selectedMethodId: 'RAZORPAY_ONLINE',
    });
    const online = model.options.find(option => option.id === 'RAZORPAY_ONLINE');

    expect(model.mode).toBe('ACTIVE_CART');
    expect(model.selectedMethodId).toBeNull();
    expect(online).toMatchObject({
      availability: 'BLOCKED',
      selected: false,
      channels: ['Cards', 'UPI', 'Wallets', 'Net banking'],
    });
    expect(online?.blockerReason).toContain('Continue from Cart');
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
