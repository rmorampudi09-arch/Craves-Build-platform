import {
  CHEF_SUBSCRIPTION_CONTRACT_MODEL,
  CHEF_SUBSCRIPTION_EXCLUDED_SOURCES,
  getChefSubscriptionMutationBoundary,
  getUnavailableChefSubscriptionCapabilities,
  hasCompleteChefSubscriptionContract,
} from './chefSubscriptionContract';

describe('chef subscription contract boundary', () => {
  it('fails closed for every Guide-51 Chef platform subscription capability', () => {
    expect(CHEF_SUBSCRIPTION_CONTRACT_MODEL).toMatchObject({
      guideReference: 51,
      status: 'blocked',
      code: 'BACKEND_CONTRACT_UNAVAILABLE',
    });

    expect(getUnavailableChefSubscriptionCapabilities()).toHaveLength(10);
    expect(
      Object.values(CHEF_SUBSCRIPTION_CONTRACT_MODEL.capabilities).every(
        capability =>
          capability.availability === 'unavailable' &&
          capability.code === 'BACKEND_CONTRACT_UNAVAILABLE',
      ),
    ).toBe(true);
    expect(hasCompleteChefSubscriptionContract()).toBe(false);
  });

  it('explicitly excludes the existing customer meal-subscription routes', () => {
    expect(CHEF_SUBSCRIPTION_EXCLUDED_SOURCES.customerMealSubscriptions).toMatchObject({
      classification: 'excluded',
      paths: [
        '/api/v1/subscriptions/plans',
        '/api/v1/subscriptions',
        '/api/v1/admin/subscription-plans',
        '/api/v1/admin/subscriptions',
      ],
    });
  });

  it.each(['changePlan', 'cancelPlan', 'renewPlan'] as const)(
    'keeps %s disabled until an exact Chef platform subscription mutation exists',
    mutation => {
      expect(getChefSubscriptionMutationBoundary(mutation)).toMatchObject({
        availability: 'unavailable',
        code: 'BACKEND_CONTRACT_UNAVAILABLE',
        allowed: false,
      });
    },
  );

  it('does not fabricate Chef platform subscription endpoints or plan values', () => {
    const serialized = JSON.stringify(CHEF_SUBSCRIPTION_CONTRACT_MODEL);

    expect(serialized).not.toContain('/api/v1/chef/subscription');
    expect(serialized).not.toContain('/api/v1/chef/plans');
    expect(serialized).not.toContain('/api/v1/chef/entitlements');
    expect(serialized).not.toContain('/api/v1/chef/billing');
    expect(serialized).not.toContain('"Basic"');
    expect(serialized).not.toContain('"Premium"');
    expect(serialized).not.toContain('"Pro"');
  });
});
