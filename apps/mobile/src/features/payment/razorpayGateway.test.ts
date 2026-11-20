jest.mock('react-native-razorpay', () => ({
  __esModule: true,
  default: {open: jest.fn()},
}));

import RazorpayCheckout from 'react-native-razorpay';
import {openRazorpayCheckout} from './gateway/razorpayGateway';
import type {RazorpayHostedHandoff} from './domain/paymentTypes';

const mockRazorpayOpen = RazorpayCheckout.open as jest.Mock;

const handoff: RazorpayHostedHandoff = {
  provider: 'RAZORPAY',
  paymentOrderId: '55555555-5555-4555-8555-555555555555',
  checkoutId: '11111111-1111-4111-8111-111111111111',
  providerOrderId: 'order_Razorpay123',
  checkoutKeyId: 'rzp_test_public_key',
  amount: {amount: '130.00', currency: 'INR'},
};

describe('production Razorpay native gateway adapter', () => {
  beforeEach(() => {
    mockRazorpayOpen.mockReset();
  });

  it('opens the backend-issued Razorpay order and returns only signed proof fields', async () => {
    mockRazorpayOpen.mockResolvedValue({
      razorpay_payment_id: 'pay_Razorpay456',
      razorpay_order_id: handoff.providerOrderId,
      razorpay_signature: 'signed_payload_proof',
    });

    await expect(
      openRazorpayCheckout(handoff, {phone: '+919999999999'}),
    ).resolves.toEqual({
      providerPaymentId: 'pay_Razorpay456',
      providerOrderId: handoff.providerOrderId,
      providerSignature: 'signed_payload_proof',
    });

    expect(mockRazorpayOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        key: handoff.checkoutKeyId,
        order_id: handoff.providerOrderId,
        amount: 13000,
        currency: 'INR',
        prefill: expect.objectContaining({contact: '+919999999999'}),
      }),
    );
  });

  it('rejects fractional subunit amounts before opening the native checkout', async () => {
    await expect(
      openRazorpayCheckout({
        ...handoff,
        amount: {amount: '130.005', currency: 'INR'},
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_AMOUNT_INVALID',
    });
    expect(mockRazorpayOpen).not.toHaveBeenCalled();
  });

  it('rejects a success payload bound to a different provider order', async () => {
    mockRazorpayOpen.mockResolvedValue({
      razorpay_payment_id: 'pay_Razorpay456',
      razorpay_order_id: 'order_different',
      razorpay_signature: 'signed_payload_proof',
    });

    await expect(openRazorpayCheckout(handoff)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ORDER_MISMATCH',
    });
  });

  it('never translates an SDK failure into payment success', async () => {
    mockRazorpayOpen.mockRejectedValue({description: 'Payment cancelled'});

    await expect(openRazorpayCheckout(handoff)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_FAILED',
      message: 'Payment cancelled',
    });
  });

  it('fails as recoverable when the native Razorpay module is not callable', async () => {
    const originalOpen = RazorpayCheckout.open;
    (RazorpayCheckout as unknown as {open?: unknown}).open = undefined;

    try {
      await expect(openRazorpayCheckout(handoff)).rejects.toMatchObject({
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        retriable: true,
      });
    } finally {
      (RazorpayCheckout as unknown as {open?: unknown}).open = originalOpen;
    }
  });

  it('supports native module builds that export open directly instead of under default', async () => {
    const moduleShape = jest.requireMock('react-native-razorpay') as {
      default?: unknown;
      open?: jest.Mock;
    };
    const originalDefault = moduleShape.default;
    const originalOpen = moduleShape.open;
    const directOpen = jest.fn().mockResolvedValue({
      razorpay_payment_id: 'pay_DirectExport',
      razorpay_order_id: handoff.providerOrderId,
      razorpay_signature: 'signed_payload_proof',
    });

    moduleShape.default = undefined;
    moduleShape.open = directOpen;

    try {
      await expect(openRazorpayCheckout(handoff)).resolves.toEqual({
        providerPaymentId: 'pay_DirectExport',
        providerOrderId: handoff.providerOrderId,
        providerSignature: 'signed_payload_proof',
      });
      expect(directOpen).toHaveBeenCalledWith(
        expect.objectContaining({order_id: handoff.providerOrderId}),
      );
    } finally {
      moduleShape.default = originalDefault;
      moduleShape.open = originalOpen;
    }
  });
});
