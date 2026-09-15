export type ChefSubscriptionCapabilityKey =
  | 'planCatalogue'
  | 'currentPlan'
  | 'eligibility'
  | 'pricing'
  | 'featureEntitlements'
  | 'changePlan'
  | 'cancelPlan'
  | 'renewPlan'
  | 'effectiveDates'
  | 'billingProvider';

export interface ChefSubscriptionContractGap {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  reason: string;
}

export interface ChefSubscriptionExcludedSource {
  classification: 'excluded';
  purpose: string;
  paths: readonly string[];
  reason: string;
}

function unavailable(reason: string): ChefSubscriptionContractGap {
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason,
  };
}

export const CHEF_SUBSCRIPTION_CAPABILITIES = {
  planCatalogue: unavailable(
    'No approved Chef platform-subscription catalogue contract exists for the Chef plans required by Guide Reference 51.',
  ),
  currentPlan: unavailable(
    'No approved Chef platform-subscription current-plan contract exists.',
  ),
  eligibility: unavailable(
    'No approved Chef platform-plan eligibility contract exists. Mobile must not infer eligibility from role, kitchen status, or UI copy.',
  ),
  pricing: unavailable(
    'No approved Chef platform-plan pricing, currency, tax, discount, or billing-cycle contract exists.',
  ),
  featureEntitlements: unavailable(
    'No approved Chef plan-entitlement contract defines Menu, Analytics, support, or promotional feature access.',
  ),
  changePlan: unavailable(
    'No approved Chef upgrade/downgrade contract exists, including confirmation, proration, idempotency, or effective-date semantics.',
  ),
  cancelPlan: unavailable(
    'No approved Chef platform-plan cancellation contract exists.',
  ),
  renewPlan: unavailable(
    'No approved Chef platform-plan renewal/reactivation contract exists.',
  ),
  effectiveDates: unavailable(
    'No approved Chef plan effective-date, grace-period, pending-change, or cancellation-date contract exists.',
  ),
  billingProvider: unavailable(
    'No approved Chef platform-subscription billing-provider integration contract exists for mobile.',
  ),
} as const satisfies Record<ChefSubscriptionCapabilityKey, ChefSubscriptionContractGap>;

/**
 * The repository does contain subscription APIs, but they model customer meal
 * plans sold by chefs. They are deliberately excluded from Guide-51 Chef
 * platform-subscription ownership so future UI work cannot accidentally reuse
 * a semantically different contract.
 */
export const CHEF_SUBSCRIPTION_EXCLUDED_SOURCES = {
  customerMealSubscriptions: {
    classification: 'excluded',
    purpose:
      'Customer meal-plan discovery/enrollment plus chef/admin maintenance of meal plans sold to customers.',
    paths: [
      '/api/v1/subscriptions/plans',
      '/api/v1/subscriptions',
      '/api/v1/admin/subscription-plans',
      '/api/v1/admin/subscriptions',
    ],
    reason:
      'These contracts represent weekly/monthly meal plans, customer subscriptions, delivery scheduling, and chef-owned sellable plan records. They do not represent a Chef purchasing or managing a CRAVES platform membership plan.',
  },
} as const satisfies Record<string, ChefSubscriptionExcludedSource>;

export interface ChefSubscriptionContractModel {
  guideReference: 51;
  status: 'blocked';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  capabilities: typeof CHEF_SUBSCRIPTION_CAPABILITIES;
  excludedSources: typeof CHEF_SUBSCRIPTION_EXCLUDED_SOURCES;
}

export const CHEF_SUBSCRIPTION_CONTRACT_MODEL: ChefSubscriptionContractModel = {
  guideReference: 51,
  status: 'blocked',
  code: 'BACKEND_CONTRACT_UNAVAILABLE',
  capabilities: CHEF_SUBSCRIPTION_CAPABILITIES,
  excludedSources: CHEF_SUBSCRIPTION_EXCLUDED_SOURCES,
};

export function getUnavailableChefSubscriptionCapabilities(): ChefSubscriptionCapabilityKey[] {
  return (
    Object.keys(CHEF_SUBSCRIPTION_CAPABILITIES) as ChefSubscriptionCapabilityKey[]
  ).filter(
    key => CHEF_SUBSCRIPTION_CAPABILITIES[key].availability === 'unavailable',
  );
}

export function hasCompleteChefSubscriptionContract(): boolean {
  return getUnavailableChefSubscriptionCapabilities().length === 0;
}

export type ChefSubscriptionMutationKey = 'changePlan' | 'cancelPlan' | 'renewPlan';

export interface ChefSubscriptionMutationBoundary {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  allowed: false;
  reason: string;
}

export function getChefSubscriptionMutationBoundary(
  mutation: ChefSubscriptionMutationKey,
): ChefSubscriptionMutationBoundary {
  const capability = CHEF_SUBSCRIPTION_CAPABILITIES[mutation];
  return {
    availability: 'unavailable',
    code: capability.code,
    allowed: false,
    reason: capability.reason,
  };
}
