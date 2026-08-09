import {
  CHEF_ANALYTICS_CONTRACT_MODEL,
  getUnavailableChefAnalyticsCapabilities,
  type ChefAnalyticsCapabilityKey,
} from './chefAnalyticsContract';

export type ChefAnalyticsMetricId =
  | 'earnings'
  | 'orders'
  | 'itemsSold'
  | 'averageOrderValue'
  | 'newCustomers'
  | 'rating';

export interface ChefAnalyticsMetricDefinition {
  id: ChefAnalyticsMetricId;
  label: string;
}

export const CHEF_ANALYTICS_METRICS: readonly ChefAnalyticsMetricDefinition[] = [
  {id: 'earnings', label: 'Earnings'},
  {id: 'orders', label: 'Orders'},
  {id: 'itemsSold', label: 'Items sold'},
  {id: 'averageOrderValue', label: 'Average order value'},
  {id: 'newCustomers', label: 'New customers'},
  {id: 'rating', label: 'Rating'},
] as const;

/**
 * These are reference-state labels only. They deliberately have no request value,
 * date boundaries, timezone, or comparison semantics because P96 established that
 * the backend does not currently define those fields.
 */
export const CHEF_ANALYTICS_REFERENCE_RANGE_OPTIONS = [
  {id: 'this-week', label: 'This week'},
  {id: 'custom', label: 'Custom'},
] as const;

export type ChefAnalyticsReferenceRangeId =
  (typeof CHEF_ANALYTICS_REFERENCE_RANGE_OPTIONS)[number]['id'];

export interface ChefAnalyticsUnavailableMetric {
  id: ChefAnalyticsMetricId;
  label: string;
  value: null;
  trend: null;
  interactive: false;
}

export interface ChefAnalyticsBlockedPresentationModel {
  status: 'blocked';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  selectedReferenceRange: 'this-week';
  dateRangeInteractionAvailable: false;
  unavailableCapabilities: readonly ChefAnalyticsCapabilityKey[];
  metrics: readonly ChefAnalyticsUnavailableMetric[];
  earningsSeries: null;
  orderStatusBreakdown: null;
  topItems: null;
  comparisonPeriod: null;
  detailedReportAvailable: false;
}

export function getChefAnalyticsBlockedPresentation(): ChefAnalyticsBlockedPresentationModel {
  return {
    status: CHEF_ANALYTICS_CONTRACT_MODEL.status,
    code: CHEF_ANALYTICS_CONTRACT_MODEL.code,
    selectedReferenceRange: 'this-week',
    dateRangeInteractionAvailable: false,
    unavailableCapabilities: getUnavailableChefAnalyticsCapabilities(),
    metrics: CHEF_ANALYTICS_METRICS.map(metric => ({
      ...metric,
      value: null,
      trend: null,
      interactive: false,
    })),
    earningsSeries: null,
    orderStatusBreakdown: null,
    topItems: null,
    comparisonPeriod: null,
    detailedReportAvailable: false,
  };
}

export function chefAnalyticsUnavailableAccessibilityLabel(label: string): string {
  return `${label} unavailable. No estimate is shown because the approved Chef analytics data contract is not available.`;
}
