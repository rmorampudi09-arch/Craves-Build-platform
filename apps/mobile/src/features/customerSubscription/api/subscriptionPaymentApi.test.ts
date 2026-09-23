import {httpClient} from '../../../core/http/httpClient';
import {
  parseSubscriptionPayment,
  subscriptionPaymentApi,
} from './subscriptionPaymentApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const postMock = httpClient.post as jest.Mock;

const SUBSCRIPTION_ID = '11111111-1111-4111-8111-111111111111';
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

const requestedPayment = {
  id: PAYMENT_ID,
  invoiceId: INVOICE_ID,
  subscriptionId: SUBSCRIPTION_ID,
  cycleStart: '2026-09-23',
  cycleEnd: '2026-10-23',
  amount: 130,
  currency: 'INR',
  status: 'PAYMENT_REQUESTED',
  paymentSessionId: null,
  providerStatus: null,
  createdAt: '2026-09-23T08:00:00Z',
  updatedAt: '2026-09-23T08:00:00Z',
  paidAt: null,
  provider: 'CASHFREE',
  providerOrderId: null,
  providerPaymentId: null,
  checkoutKeyId: null,
};

const razorpayPending = {
  ...requestedPayment,
  amount: '130.00',
  status: 'PAYMENT_PENDING',
  provider: 'RAZORPAY',
  providerOrderId: 'order_subscription123',
  checkoutKeyId: 'rzp_test_public123',
  providerStatus: 'created',
  updatedAt: '2026-09-23T08:01:00Z',
};

describe('subscription payment contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('parses the backend payment-intent response without losing money precision', () => {
    expect(parseSubscriptionPayment(requestedPayment)).toEqual({
      id: PAYMENT_ID,
      invoiceId: INVOICE_ID,
      subscriptionId: SUBSCRIPTION_ID,
      cycleStart: '2026-09-23',
      cycleEnd: '2026-10-23',
      amount: {amount: '130', currency: 'INR'},
      status: 'PAYMENT_REQUESTED',
      provider: 'CASHFREE',
      providerOrderId: null,
      providerPaymentId: null,
      checkoutKeyId: null,
      paymentSessionId: null,
      providerStatus: null,
      createdAt: '2026-09-23T08:00:00Z',
      updatedAt: '2026-09-23T08:00:00Z',
      paidAt: null,
    });
  });

  it('rejects an unusable Razorpay pending response', () => {
    expect(
      parseSubscriptionPayment({
        ...razorpayPending,
        checkoutKeyId: null,
      }),
    ).toBeNull();
  });

  it('reads the latest owned invoice from the exact subscription-payment route', async () => {
    getMock.mockResolvedValue(requestedPayment);

    await expect(
      subscriptionPaymentApi.getLatestForSubscription(SUBSCRIPTION_ID),
    ).resolves.toMatchObject({
      invoiceId: INVOICE_ID,
      subscriptionId: SUBSCRIPTION_ID,
      status: 'PAYMENT_REQUESTED',
    });

    expect(getMock).toHaveBeenCalledWith(
      `/api/v1/subscription-payments/subscriptions/${SUBSCRIPTION_ID}`,
      {
        signal: undefined,
        dedupeKey: `subscription-payment:subscription:${SUBSCRIPTION_ID}`,
      },
    );
  });

  it('reads one owned invoice and verifies the returned invoice identity', async () => {
    getMock.mockResolvedValue(requestedPayment);

    await expect(subscriptionPaymentApi.getInvoice(INVOICE_ID)).resolves.toMatchObject({
      id: PAYMENT_ID,
      invoiceId: INVOICE_ID,
    });

    expect(getMock).toHaveBeenCalledWith(
      `/api/v1/subscription-payments/invoices/${INVOICE_ID}`,
      {
        signal: undefined,
        dedupeKey: `subscription-payment:invoice:${INVOICE_ID}`,
      },
    );
  });

  it('creates a provider order with only the backend request fields', async () => {
    postMock.mockResolvedValue(razorpayPending);

    await expect(
      subscriptionPaymentApi.createOrder(INVOICE_ID, {
        customerName: ' Ashoka Sanjapu ',
        customerPhone: ' +919876543210 ',
        customerEmail: ' ashoka@example.com ',
      }),
    ).resolves.toMatchObject({
      provider: 'RAZORPAY',
      providerOrderId: 'order_subscription123',
      checkoutKeyId: 'rzp_test_public123',
    });

    expect(postMock).toHaveBeenCalledWith(
      `/api/v1/subscription-payments/invoices/${INVOICE_ID}/orders`,
      {
        customerName: 'Ashoka Sanjapu',
        customerPhone: '+919876543210',
        customerEmail: 'ashoka@example.com',
      },
    );
  });

  it('posts the exact Razorpay verification proof and validates the response invoice', async () => {
    const paid = {
      ...razorpayPending,
      status: 'PAID',
      providerPaymentId: 'pay_subscription123',
      providerStatus: 'captured',
      updatedAt: '2026-09-23T08:02:00Z',
      paidAt: '2026-09-23T08:02:00Z',
    };
    postMock.mockResolvedValue(paid);
    const providerSignature = 'a'.repeat(64);

    await expect(
      subscriptionPaymentApi.verifyRazorpay(INVOICE_ID, {
        providerOrderId: 'order_subscription123',
        providerPaymentId: 'pay_subscription123',
        providerSignature,
      }),
    ).resolves.toMatchObject({
      invoiceId: INVOICE_ID,
      status: 'PAID',
      providerPaymentId: 'pay_subscription123',
    });

    expect(postMock).toHaveBeenCalledWith(
      `/api/v1/subscription-payments/invoices/${INVOICE_ID}/verify`,
      {
        providerOrderId: 'order_subscription123',
        providerPaymentId: 'pay_subscription123',
        providerSignature,
      },
    );
  });

  it('rejects an invalid invoice id before creating a provider order', async () => {
    await expect(
      subscriptionPaymentApi.createOrder('not-an-invoice-id', {
        customerName: 'Ashoka Sanjapu',
        customerPhone: '+919876543210',
      }),
    ).rejects.toMatchObject({
      code: 'SUBSCRIPTION_PAYMENT_INVALID_ID',
    });

    expect(postMock).not.toHaveBeenCalled();
  });

  it('fails closed when verification returns a different invoice', async () => {
    postMock.mockResolvedValue({
      ...razorpayPending,
      invoiceId: '44444444-4444-4444-8444-444444444444',
      status: 'PAID',
      providerPaymentId: 'pay_subscription123',
      providerStatus: 'captured',
      updatedAt: '2026-09-23T08:02:00Z',
      paidAt: '2026-09-23T08:02:00Z',
    });

    await expect(
      subscriptionPaymentApi.verifyRazorpay(INVOICE_ID, {
        providerOrderId: 'order_subscription123',
        providerPaymentId: 'pay_subscription123',
        providerSignature: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({
      code: 'SUBSCRIPTION_PAYMENT_IDENTITY_MISMATCH',
    });
  });

  it('fails closed when a backend response belongs to another subscription', async () => {
    getMock.mockResolvedValue({
      ...requestedPayment,
      subscriptionId: '44444444-4444-4444-8444-444444444444',
    });

    await expect(
      subscriptionPaymentApi.getLatestForSubscription(SUBSCRIPTION_ID),
    ).rejects.toMatchObject({
      code: 'SUBSCRIPTION_PAYMENT_IDENTITY_MISMATCH',
    });
  });
});
