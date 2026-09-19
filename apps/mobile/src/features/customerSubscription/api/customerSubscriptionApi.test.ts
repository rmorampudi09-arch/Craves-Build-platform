import {httpClient} from '../../../core/http/httpClient';
import {
  customerSubscriptionApi,
  publicSubscriptionPolicySchema,
} from './customerSubscriptionApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
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
