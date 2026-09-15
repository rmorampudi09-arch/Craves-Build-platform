import AsyncStorage from '@react-native-async-storage/async-storage';
import {pendingPaymentAttemptStore} from './storage/pendingPaymentAttemptStore';
import type {RazorpayHostedHandoff} from './domain/paymentTypes';

const handoff: RazorpayHostedHandoff = {
  provider: 'RAZORPAY',
  paymentOrderId: '55555555-5555-4555-8555-555555555555',
  checkoutId: '11111111-1111-4111-8111-111111111111',
  providerOrderId: 'order_Razorpay123',
  checkoutKeyId: 'rzp_test_public_key',
  amount: {amount: '130.00', currency: 'INR'},
};

describe('pending payment attempt store', () => {
  const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    storage.getItem.mockReset();
    storage.setItem.mockReset();
    storage.removeItem.mockReset();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    storage.removeItem.mockResolvedValue(undefined);
  });

  it('persists only non-secret recovery data', async () => {
    await pendingPaymentAttemptStore.save(handoff);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const [, raw] = storage.setItem.mock.calls[0];
    const stored = JSON.parse(raw);
    expect(stored).toMatchObject({
      version: 1,
      paymentOrderId: handoff.paymentOrderId,
      checkoutId: handoff.checkoutId,
      providerOrderId: handoff.providerOrderId,
      amount: handoff.amount,
    });
    expect(stored).not.toHaveProperty('checkoutKeyId');
    expect(stored).not.toHaveProperty('providerSignature');
    expect(stored).not.toHaveProperty('providerPaymentId');
  });

  it('loads a valid interrupted payment reference', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        version: 1,
        paymentOrderId: handoff.paymentOrderId,
        checkoutId: handoff.checkoutId,
        providerOrderId: handoff.providerOrderId,
        amount: handoff.amount,
        savedAt: '2026-08-16T08:55:00.000Z',
      }),
    );

    await expect(pendingPaymentAttemptStore.load()).resolves.toEqual({
      paymentOrderId: handoff.paymentOrderId,
      checkoutId: handoff.checkoutId,
      providerOrderId: handoff.providerOrderId,
      amount: handoff.amount,
    });
  });

  it('fails closed and removes malformed local state', async () => {
    storage.getItem.mockResolvedValue('{bad-json');

    await expect(pendingPaymentAttemptStore.load()).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered payment reference and clears it', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        version: 1,
        paymentOrderId: 'not-a-uuid',
        checkoutId: handoff.checkoutId,
        providerOrderId: handoff.providerOrderId,
        amount: handoff.amount,
        savedAt: '2026-08-16T08:55:00.000Z',
      }),
    );

    await expect(pendingPaymentAttemptStore.load()).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });
});
