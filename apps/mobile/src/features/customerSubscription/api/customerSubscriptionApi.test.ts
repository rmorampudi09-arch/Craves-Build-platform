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

