import {
  CHEF_SUBSCRIPTION_CAPABILITIES,
  getChefSubscriptionMutationBoundary,
  type ChefSubscriptionMutationBoundary,
  type ChefSubscriptionMutationKey,
} from './chefSubscriptionContract';

export interface ChefSubscriptionUnavailableValue {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  value: null;
  reason: string;
}

export interface ChefSubscriptionUnavailableCollection {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  items: readonly [];
  reason: string;
}

export interface ChefSubscriptionSupportBoundary {
  availability: 'unavailable';
  code: 'MOBILE_DESTINATION_UNAVAILABLE';
  allowed: false;
  reason: string;
}

export interface ChefSubscriptionPlanBoundaryState {
  status: 'blocked';
  currentPlan: ChefSubscriptionUnavailableValue;
  billingCycle: ChefSubscriptionUnavailableValue;
  pricing: ChefSubscriptionUnavailableValue;
  eligibility: ChefSubscriptionUnavailableValue;
  subscriptionStatus: ChefSubscriptionUnavailableValue;
  annualSavings: ChefSubscriptionUnavailableValue;
  plans: ChefSubscriptionUnavailableCollection;
  featureMatrix: ChefSubscriptionUnavailableCollection;
  purchaseManageState: Readonly<
    Record<ChefSubscriptionMutationKey, ChefSubscriptionMutationBoundary>
  >;
  support: ChefSubscriptionSupportBoundary;
}

function unavailableValue(reason: string): ChefSubscriptionUnavailableValue {
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    value: null,
    reason,
  };
}

function unavailableCollection(reason: string): ChefSubscriptionUnavailableCollection {
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    items: [],
    reason,
  };
}

export const CHEF_SUBSCRIPTION_SUPPORT_BOUNDARY: ChefSubscriptionSupportBoundary = {
  availability: 'unavailable',
  code: 'MOBILE_DESTINATION_UNAVAILABLE',
  allowed: false,
  reason:
    'No approved Chef subscription-specific support destination is registered in the current mobile route contract.',
};

export function createChefSubscriptionPlanBoundaryState(): ChefSubscriptionPlanBoundaryState {
  return {
    status: 'blocked',
    currentPlan: unavailableValue(CHEF_SUBSCRIPTION_CAPABILITIES.currentPlan.reason),
    billingCycle: unavailableValue(CHEF_SUBSCRIPTION_CAPABILITIES.pricing.reason),
    pricing: unavailableValue(CHEF_SUBSCRIPTION_CAPABILITIES.pricing.reason),
    eligibility: unavailableValue(CHEF_SUBSCRIPTION_CAPABILITIES.eligibility.reason),
    subscriptionStatus: unavailableValue(
      CHEF_SUBSCRIPTION_CAPABILITIES.effectiveDates.reason,
    ),
    annualSavings: unavailableValue(CHEF_SUBSCRIPTION_CAPABILITIES.pricing.reason),
    plans: unavailableCollection(CHEF_SUBSCRIPTION_CAPABILITIES.planCatalogue.reason),
    featureMatrix: unavailableCollection(
      CHEF_SUBSCRIPTION_CAPABILITIES.featureEntitlements.reason,
    ),
    purchaseManageState: {
      changePlan: getChefSubscriptionMutationBoundary('changePlan'),
      cancelPlan: getChefSubscriptionMutationBoundary('cancelPlan'),
      renewPlan: getChefSubscriptionMutationBoundary('renewPlan'),
    },
    support: CHEF_SUBSCRIPTION_SUPPORT_BOUNDARY,
  };
}
