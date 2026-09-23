import AsyncStorage from '@react-native-async-storage/async-storage';
import {pendingSubscriptionPaymentStore} from './storage/pendingSubscriptionPaymentStore';

const reference = {
  invoiceId: '22222222-2222-4222-8222-222222222222',
  subscriptionId: '11111111-1111-4111-8111-111111111111',
  providerOrderId: 'order_subscription123',
  amount: {amount: '130.00', currency: 'INR'},
};

describe('pending subscription payment store', () => {
  const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    storage.getItem.mockReset();
    storage.setItem.mockReset();
    storage.removeItem.mockReset();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
    storage.removeItem.mockResolvedValue(undefined);
  });

  it('persists only the non-secret invoice recovery reference', async () => {
    await pendingSubscriptionPaymentStore.save(reference);

    const [, raw] = storage.setItem.mock.calls[0];
    const stored = JSON.parse(raw);
    expect(stored).toMatchObject({
      version: 1,
      invoiceId: reference.invoiceId,
      subscriptionId: reference.subscriptionId,
      providerOrderId: reference.providerOrderId,
      amount: reference.amount,
    });
    expect(stored).not.toHaveProperty('checkoutKeyId');
    expect(stored).not.toHaveProperty('providerSignature');
    expect(stored).not.toHaveProperty('providerPaymentId');
  });

  it('loads a valid interrupted subscription payment', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        version: 1,
        ...reference,
        savedAt: '2026-09-23T09:30:00.000Z',
      }),
    );

    await expect(pendingSubscriptionPaymentStore.load()).resolves.toEqual(reference);
  });

  it('clears malformed or tampered recovery state', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        version: 1,
        ...reference,
        providerOrderId: 'not-a-razorpay-order',
        savedAt: '2026-09-23T09:30:00.000Z',
      }),
    );

    await expect(pendingSubscriptionPaymentStore.load()).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });
});
