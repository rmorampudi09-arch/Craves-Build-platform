import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {customerProfileApi} from '../../customerProfile/api/customerProfileApi';
import {openRazorpayCheckout} from '../../payment/gateway/razorpayGateway';
import {customerSubscriptionApi} from '../api/customerSubscriptionApi';
import {subscriptionPaymentApi} from '../api/subscriptionPaymentApi';
import type {SubscriptionPayment} from '../domain/subscriptionPaymentTypes';
import {pendingSubscriptionPaymentStore} from '../storage/pendingSubscriptionPaymentStore';
import {MealPlanCheckoutProvider} from './MealPlanCheckoutContext';
import {
  checkoutOutcome,
  useInterruptedPaymentRecovery,
  useSubscriptionCheckout,
} from './useSubscriptionCheckout';

jest.mock('../../customerAddresses/query/customerAddressQueries', () => ({
  useCustomerAddressesQuery: jest.fn(),
}));
jest.mock('../query/mealPlanQueries', () => ({
  invalidateMealPlanQueries: jest.fn(async () => undefined),
}));
jest.mock('../api/customerSubscriptionApi', () => ({
  customerSubscriptionApi: {create: jest.fn()},
}));
jest.mock('../api/subscriptionPaymentApi', () => ({
  subscriptionPaymentApi: {
    getLatestForSubscription: jest.fn(),
    getInvoice: jest.fn(),
    createOrder: jest.fn(),
    verifyRazorpay: jest.fn(),
  },
}));
jest.mock('../../customerProfile/api/customerProfileApi', () => ({
  customerProfileApi: {getProfile: jest.fn()},
}));
jest.mock('../../payment/gateway/razorpayGateway', () => ({
  openRazorpayCheckout: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('../storage/pendingSubscriptionPaymentStore', () => ({
  pendingSubscriptionPaymentStore: {
    save: jest.fn(async () => undefined),
    load: jest.fn(async () => null),
    clear: jest.fn(async () => undefined),
  },
}));

const SUBSCRIPTION_ID = '11111111-1111-4111-8111-111111111111';

function payment(status: SubscriptionPayment['status']): SubscriptionPayment {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    invoiceId: '22222222-2222-4222-8222-222222222222',
    subscriptionId: SUBSCRIPTION_ID,
    cycleStart: '2026-10-12',
    cycleEnd: '2026-10-19',
    amount: {amount: '1499', currency: 'INR'},
    status,
    provider: 'RAZORPAY',
    providerOrderId: 'order_abc123',
    providerPaymentId: null,
    checkoutKeyId: 'rzp_test_key',
    paymentSessionId: null,
    providerStatus: null,
    createdAt: '2026-10-11T10:00:00Z',
    updatedAt: '2026-10-11T10:00:00Z',
    paidAt: status === 'PAID' ? '2026-10-11T10:05:00Z' : null,
  };
}

describe('checkoutOutcome', () => {
  it('treats a PAID invoice as paid and carries the payment', () => {
    const paid = payment('PAID');
    expect(checkoutOutcome(paid, SUBSCRIPTION_ID)).toEqual({
      kind: 'paid',
      subscriptionId: SUBSCRIPTION_ID,
      payment: paid,
    });
  });

  it.each(['PAYMENT_REQUESTED', 'PAYMENT_PENDING'] as const)(
    'treats %s as still processing',
    status => {
      expect(checkoutOutcome(payment(status), SUBSCRIPTION_ID)).toEqual({
        kind: 'processing',
        subscriptionId: SUBSCRIPTION_ID,
      });
    },
  );

  it.each(['FAILED', 'CANCELLED'] as const)('treats %s as not completed', status => {
    expect(checkoutOutcome(payment(status), SUBSCRIPTION_ID)).toEqual({
      kind: 'not-completed',
      subscriptionId: SUBSCRIPTION_ID,
      message: 'Payment not completed. You can try again.',
    });
  });

  it('treats an unknown payment as not completed', () => {
    expect(checkoutOutcome(null, SUBSCRIPTION_ID)).toEqual({
      kind: 'not-completed',
      subscriptionId: SUBSCRIPTION_ID,
      message: 'Payment not completed. You can try again.',
    });
  });
});

describe('useSubscriptionCheckout', () => {
  const input = {
    planId: '44444444-4444-4444-8444-444444444444',
    startDate: '2026-10-14',
    deliveryAddressId: '55555555-5555-4555-8555-555555555555',
  };
  const proof = {
    providerOrderId: 'order_abc123',
    providerPaymentId: 'pay_abc123',
    providerSignature: 'a'.repeat(64),
  };
  const api = {
    create: jest.mocked(customerSubscriptionApi.create),
    latest: jest.mocked(subscriptionPaymentApi.getLatestForSubscription),
    createOrder: jest.mocked(subscriptionPaymentApi.createOrder),
    verify: jest.mocked(subscriptionPaymentApi.verifyRazorpay),
    profile: jest.mocked(customerProfileApi.getProfile),
    checkout: jest.mocked(openRazorpayCheckout),
  };
  const keys = () => api.create.mock.calls.map(call => call[1]);

  let checkout: ReturnType<typeof useSubscriptionCheckout>;
  function Probe() {
    checkout = useSubscriptionCheckout();
    return null;
  }
  let tree: ReturnType<typeof create> | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    api.create.mockResolvedValue({id: SUBSCRIPTION_ID} as never);
    api.latest.mockResolvedValue(payment('PAYMENT_REQUESTED'));
    api.profile.mockResolvedValue({
      profile: {displayName: 'Asha', registeredPhone: {registeredPhoneNumber: '+919999999999'}, email: null},
    } as never);
    api.createOrder.mockResolvedValue(payment('PAYMENT_PENDING'));
    api.checkout.mockResolvedValue(proof);
    api.verify.mockResolvedValue(payment('PAID'));
    act(() => {
      tree = create(
        <QueryClientProvider client={new QueryClient()}>
          <MealPlanCheckoutProvider>
            <Probe />
          </MealPlanCheckoutProvider>
        </QueryClientProvider>,
      );
    });
  });
  afterEach(() => act(() => tree?.unmount()));

  const pay = async (run: () => Promise<unknown>) => {
    let outcome: unknown;
    await act(async () => {
      outcome = await run();
    });
    return outcome;
  };

  it('pays the created subscription on retry instead of creating another', async () => {
    api.checkout.mockRejectedValueOnce(
      new AppApiError('PAYMENT_PROVIDER_FAILED', 'Payment cancelled by user'),
    );
    expect(await pay(() => checkout.payNew(input))).toEqual({
      kind: 'not-completed',
      subscriptionId: SUBSCRIPTION_ID,
      message: 'Payment not completed. You can try again.',
    });
    expect(await pay(() => checkout.payNew(input))).toMatchObject({kind: 'paid'});
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.checkout).toHaveBeenCalledTimes(2);

    // A paid checkout is finished: the same details start a new subscription.
    await pay(() => checkout.payNew(input));
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it('replays the same idempotency key after an unconfirmed create, a new one for new details', async () => {
    api.create.mockRejectedValue(new Error('socket closed'));
    const unconfirmed = {
      kind: 'not-completed',
      subscriptionId: null,
      message: 'Your request was not confirmed. Please retry with the same details.',
    };
    expect(await pay(() => checkout.payNew(input))).toEqual(unconfirmed);
    await pay(() => checkout.payNew(input));
    await pay(() => checkout.payNew({...input, startDate: '2026-10-15'}));
    expect(keys()[1]).toBe(keys()[0]);
    expect(keys()[2]).not.toBe(keys()[0]);
  });

  it('shows the server reason when the create is definitely rejected', async () => {
    api.create.mockRejectedValue(
      new AppApiError('PLAN_NOT_ACCEPTING_SUBSCRIBERS', 'This plan is not taking new subscribers.', 409),
    );
    expect(await pay(() => checkout.payNew(input))).toMatchObject({
      message: 'This plan is not taking new subscribers.',
    });
  });

  it('joins a second tap to the checkout already open', async () => {
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    await act(async () => {
      first = checkout.payExisting(SUBSCRIPTION_ID);
      second = checkout.payExisting(SUBSCRIPTION_ID);
      await first;
    });
    expect(second).toBe(first);
    expect(api.checkout).toHaveBeenCalledTimes(1);
  });

  it('reports processing when Razorpay returned proof but verification failed', async () => {
    api.verify.mockRejectedValue(new Error('timeout'));
    expect(await pay(() => checkout.payExisting(SUBSCRIPTION_ID))).toEqual({
      kind: 'processing',
      subscriptionId: SUBSCRIPTION_ID,
    });
    expect(pendingSubscriptionPaymentStore.save).toHaveBeenCalled();
    expect(pendingSubscriptionPaymentStore.clear).not.toHaveBeenCalled();
  });
});

describe('useInterruptedPaymentRecovery', () => {
  let recovery: ReturnType<typeof useInterruptedPaymentRecovery>;
  function Probe() {
    recovery = useInterruptedPaymentRecovery();
    return null;
  }
  let tree: ReturnType<typeof create> | undefined;
  afterEach(() => act(() => tree?.unmount()));

  it.each([
    ['PAID', {kind: 'paid', subscriptionId: SUBSCRIPTION_ID}],
    ['FAILED', {kind: 'failed'}],
    ['CANCELLED', {kind: 'failed'}],
  ] as const)('reports a %s interrupted payment until dismissed and clears the store', async (status, expected) => {
    jest.clearAllMocks();
    const invoice = payment(status);
    jest.mocked(pendingSubscriptionPaymentStore.load).mockResolvedValueOnce({
      invoiceId: invoice.invoiceId,
      subscriptionId: SUBSCRIPTION_ID,
      providerOrderId: 'order_abc123',
      amount: invoice.amount,
    } as never);
    jest.mocked(subscriptionPaymentApi.getInvoice).mockResolvedValueOnce(invoice);
    await act(async () => {
      tree = create(
        <QueryClientProvider client={new QueryClient()}>
          <MealPlanCheckoutProvider>
            <Probe />
          </MealPlanCheckoutProvider>
        </QueryClientProvider>,
      );
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    });
    expect(recovery.settled).toEqual(expected);
    expect(recovery.pending).toBeNull();
    expect(pendingSubscriptionPaymentStore.clear).toHaveBeenCalledTimes(1);

    act(() => recovery.dismissSettled());
    expect(recovery.settled).toBeNull();
  });
});
