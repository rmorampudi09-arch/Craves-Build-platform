import {httpClient} from '../../../core/http/httpClient';
import {
  customerSubscriptionApi,
  publicSubscriptionPolicySchema,
} from './customerSubscriptionApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const PLAN_ID = '11111111-1111-4111-8111-111111111111';

const policy = {
  customerPauseEnabled: true,
  customerResumeEnabled: true,
  customerCancelEnabled: true,
  customerSkipEnabled: false,
  pauseCutoffMinutes: 120,
  resumeLeadMinutes: 60,
  cancelCutoffMinutes: 1440,
  skipCutoffMinutes: null,
  holidayPolicyReference: 'HOLIDAY_STANDARD',
  unusedMealPolicyReference: 'UNUSED_MEALS_EXPIRE',
  refundPolicyReference: 'REFUND_POLICY_V1',
};

describe('customerSubscriptionApi policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the exact public plan-policy route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(policy);

    await expect(
      customerSubscriptionApi.getPlanPolicy(PLAN_ID),
    ).resolves.toEqual(policy);

    expect(httpClient.get).toHaveBeenCalledWith(
      `/api/v1/subscriptions/plans/${PLAN_ID}/policy`,
      {
        signal: undefined,
        dedupeKey: `customer-subscription:policy:${PLAN_ID}`,
      },
    );
  });

  it('fails closed if public policy includes unsupported fields', () => {
    expect(
      publicSubscriptionPolicySchema.safeParse({
        ...policy,
        internalPolicyVersion: 7,
      }).success,
    ).toBe(false);
  });
});

const SUBSCRIPTION_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = '55555555-5555-4555-8555-555555555555';

const planBase = {
  id: PLAN_ID,
  planCode: 'WEEKLY_LUNCH',
  name: 'Weekly Lunch',
  description: null,
  billingPeriod: 'WEEKLY',
  amount: 1499,
  currency: 'INR',
};

const subscriptionBase = {
  id: SUBSCRIPTION_ID,
  planId: PLAN_ID,
  status: 'ACTIVE',
  startDate: '2026-10-12',
  endDate: null,
  nextServiceDate: '2026-10-12',
  deliveryAddressId: '66666666-6666-4666-8666-666666666666',
  notes: null,
  createdAt: '2026-10-11T08:30:00Z',
  updatedAt: '2026-10-11T08:30:00Z',
};

const occurrenceBase = {
  id: '77777777-7777-4777-8777-777777777777',
  serviceDate: '2026-10-12',
  mealSlotCode: 'LUNCH',
  serviceAt: '2026-10-12T06:30:00Z',
  status: 'ORDER_CREATED',
  items: [],
};

describe('customerSubscriptionApi optional presentation fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses today\'s production responses that lack the new fields', async () => {
    (httpClient.get as jest.Mock)
      .mockResolvedValueOnce([planBase])
      .mockResolvedValueOnce([subscriptionBase])
      .mockResolvedValueOnce([occurrenceBase]);

    const [plan] = await customerSubscriptionApi.listPlans();
    const [subscription] = await customerSubscriptionApi.listMine();
    const [occurrence] = await customerSubscriptionApi.listOccurrences(SUBSCRIPTION_ID);

    expect(plan.imageUrl ?? null).toBeNull();
    expect(subscription.planName ?? null).toBeNull();
    expect(subscription.amount ?? null).toBeNull();
    expect(subscription.nextBillingDate ?? null).toBeNull();
    expect(subscription.planImageUrl ?? null).toBeNull();
    expect(occurrence.orderId ?? null).toBeNull();
  });

  it('accepts explicit nulls for the new fields', async () => {
    (httpClient.get as jest.Mock)
      .mockResolvedValueOnce([{...planBase, imageUrl: null}])
      .mockResolvedValueOnce([
        {
          ...subscriptionBase,
          planName: null,
          billingPeriod: null,
          amount: null,
          currency: null,
          nextBillingDate: null,
          planImageUrl: null,
        },
      ])
      .mockResolvedValueOnce([{...occurrenceBase, orderId: null}]);

    await expect(customerSubscriptionApi.listPlans()).resolves.toHaveLength(1);
    await expect(customerSubscriptionApi.listMine()).resolves.toHaveLength(1);
    await expect(
      customerSubscriptionApi.listOccurrences(SUBSCRIPTION_ID),
    ).resolves.toHaveLength(1);
  });

  it('maps the new fields when the backend sends them', async () => {
    const planImage = `/api/v1/subscriptions/plans/${PLAN_ID}/image`;
    (httpClient.get as jest.Mock)
      .mockResolvedValueOnce([{...planBase, imageUrl: planImage}])
      .mockResolvedValueOnce([
        {
          ...subscriptionBase,
          planName: 'Weekly Lunch',
          billingPeriod: 'WEEKLY',
          amount: 1499,
          currency: 'INR',
          nextBillingDate: '2026-10-19',
          planImageUrl: planImage,
        },
      ])
      .mockResolvedValueOnce([{...occurrenceBase, orderId: ORDER_ID}]);

    const [plan] = await customerSubscriptionApi.listPlans();
    const [subscription] = await customerSubscriptionApi.listMine();
    const [occurrence] = await customerSubscriptionApi.listOccurrences(SUBSCRIPTION_ID);

    expect(plan.imageUrl).toBe(planImage);
    expect(subscription).toMatchObject({
      planName: 'Weekly Lunch',
      billingPeriod: 'WEEKLY',
      amount: 1499,
      currency: 'INR',
      nextBillingDate: '2026-10-19',
      planImageUrl: planImage,
    });
    expect(occurrence.orderId).toBe(ORDER_ID);
  });

  it('still rejects malformed values for the new fields', async () => {
    (httpClient.get as jest.Mock).mockResolvedValueOnce([
      {...subscriptionBase, nextBillingDate: 'next week'},
    ]);

    await expect(customerSubscriptionApi.listMine()).rejects.toThrow('Subscriptions');
  });
});

describe('customerSubscriptionApi skip contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the exact skip request and verifies the backend acknowledgement', async () => {
    const subscriptionId = '22222222-2222-4222-8222-222222222222';
    const response = {
      id: '33333333-3333-4333-8333-333333333333',
      subscriptionId,
      serviceDate: '2026-09-25',
      status: 'REQUESTED',
      reason: 'Travelling',
      occurrenceId: null,
      createdAt: '2026-09-20T08:30:00Z',
      appliedAt: null,
      updatedAt: '2026-09-20T08:30:00Z',
    };
    (httpClient.post as jest.Mock).mockResolvedValue(response);

    await expect(
      customerSubscriptionApi.skip(
        subscriptionId,
        '2026-09-25',
        '  Travelling  ',
      ),
    ).resolves.toEqual(response);

    expect(httpClient.post).toHaveBeenCalledWith(
      `/api/v1/subscriptions/${subscriptionId}/skips`,
      {serviceDate: '2026-09-25', reason: 'Travelling'},
    );
  });

  it('fails closed if the skip acknowledgement belongs to another subscription', async () => {
    const subscriptionId = '22222222-2222-4222-8222-222222222222';
    (httpClient.post as jest.Mock).mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      subscriptionId: '44444444-4444-4444-8444-444444444444',
      serviceDate: '2026-09-25',
      status: 'REQUESTED',
      reason: null,
      occurrenceId: null,
      createdAt: '2026-09-20T08:30:00Z',
      appliedAt: null,
      updatedAt: '2026-09-20T08:30:00Z',
    });

    await expect(
      customerSubscriptionApi.skip(subscriptionId, '2026-09-25'),
    ).rejects.toThrow('Subscription skip');
  });
});

