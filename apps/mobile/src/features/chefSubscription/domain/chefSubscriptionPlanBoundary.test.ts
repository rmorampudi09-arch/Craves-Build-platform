import {createChefSubscriptionPlanBoundaryState} from './chefSubscriptionPlanBoundary';

describe('chef subscription plan UI boundary', () => {
  it('keeps all server-owned plan presentation values empty when the Chef contract is unavailable', () => {
    const state = createChefSubscriptionPlanBoundaryState();

    expect(state).toMatchObject({
      status: 'blocked',
      currentPlan: {availability: 'unavailable', value: null},
      billingCycle: {availability: 'unavailable', value: null},
      pricing: {availability: 'unavailable', value: null},
      eligibility: {availability: 'unavailable', value: null},
      subscriptionStatus: {availability: 'unavailable', value: null},
      annualSavings: {availability: 'unavailable', value: null},
    });
    expect(state.plans.items).toHaveLength(0);
    expect(state.featureMatrix.items).toHaveLength(0);
  });

  it.each(['changePlan', 'cancelPlan', 'renewPlan'] as const)(
    'keeps %s non-runnable instead of creating a fake high-impact mutation',
    mutation => {
      const state = createChefSubscriptionPlanBoundaryState();
      expect(state.purchaseManageState[mutation]).toMatchObject({
        availability: 'unavailable',
        code: 'BACKEND_CONTRACT_UNAVAILABLE',
        allowed: false,
      });
    },
  );

  it('keeps subscription support fail-closed when no approved destination is registered', () => {
    const state = createChefSubscriptionPlanBoundaryState();
    expect(state.support).toMatchObject({
      availability: 'unavailable',
      code: 'MOBILE_DESTINATION_UNAVAILABLE',
      allowed: false,
    });
  });

  it('does not turn reference-only tier names or values into runtime subscription data', () => {
    const serialized = JSON.stringify(createChefSubscriptionPlanBoundaryState());

    expect(serialized).not.toContain('"Basic"');
    expect(serialized).not.toContain('"Premium"');
    expect(serialized).not.toContain('"Pro"');
    expect(serialized).not.toMatch(/₹|\$|USD|INR/);
  });
});
