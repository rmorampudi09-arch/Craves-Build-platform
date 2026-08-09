export type ChefAnalyticsCapabilityKey =
  | 'summaryKpis'
  | 'dateRangeFiltering'
  | 'earningsSeries'
  | 'orderStatusMetrics'
  | 'itemPerformance'
  | 'customerMetrics'
  | 'ratingMetrics'
  | 'comparisonPeriod'
  | 'reportDetailExport';

export interface ChefAnalyticsContractGap {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  reason: string;
}

export interface ChefAnalyticsReconciliationSource {
  availability: 'source-only';
  method: 'GET';
  path: string;
  supportedQueryParameters: readonly string[];
  purpose: string;
  limitations: readonly string[];
}

function contractGap(reason: string): ChefAnalyticsContractGap {
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason,
  };
}

export const CHEF_ANALYTICS_CAPABILITIES = {
  summaryKpis: contractGap(
    'No approved Chef analytics summary/KPI contract exists for earnings, orders, items sold, average order value, new customers, or rating.',
  ),
  dateRangeFiltering: contractGap(
    'No approved Chef analytics request contract defines preset/custom date ranges, timezone, comparison periods, or range-validation semantics.',
  ),
  earningsSeries: contractGap(
    'The Chef earnings endpoint is a bounded ledger read with only a limit parameter; it does not define analytics buckets, date filtering, comparison values, or chart-series semantics.',
  ),
  orderStatusMetrics: contractGap(
    'The Chef orders endpoint returns operational orders, not an authoritative date-ranged status-metrics aggregate.',
  ),
  itemPerformance: contractGap(
    'No approved Chef item-performance/top-items analytics contract exists; menu and order records do not define authoritative performance aggregation semantics.',
  ),
  customerMetrics: contractGap(
    'No approved Chef analytics contract exposes new/returning customer metrics or the privacy-safe customer dimensions required to calculate them.',
  ),
  ratingMetrics: contractGap(
    'No approved Chef rating/review analytics contract exists for the Analytics screen.',
  ),
  comparisonPeriod: contractGap(
    'No approved backend contract defines prior-period comparison windows, deltas, or trend semantics for Chef analytics.',
  ),
  reportDetailExport: contractGap(
    'No approved Chef analytics report-detail or export endpoint is present in the current repository contract surface.',
  ),
} as const satisfies Record<ChefAnalyticsCapabilityKey, ChefAnalyticsContractGap>;

export const CHEF_ANALYTICS_RECONCILIATION_SOURCES = {
  orders: {
    availability: 'source-only',
    method: 'GET',
    path: '/api/v1/chef/orders',
    supportedQueryParameters: [],
    purpose:
      'Operational reconciliation with the Chef Orders and Dashboard sources already owned by the mobile app.',
    limitations: [
      'No approved date-range/filter contract.',
      'No authoritative monetary KPI or average-order-value definition.',
      'No analytics aggregation or comparison-period semantics.',
    ],
  },
  earnings: {
    availability: 'source-only',
    method: 'GET',
    path: '/api/v1/chef/earnings',
    supportedQueryParameters: ['limit'],
    purpose:
      'Financial-ledger reconciliation with Dashboard/Payout definitions without reclassifying ledger rows as analytics series.',
    limitations: [
      'Only a limit query parameter is defined for the Chef read.',
      'No from/to date filtering, bucket interval, timezone, or comparison-period semantics.',
      'Ledger status/amount fields do not define Screen-46 business KPI formulas.',
    ],
  },
  menu: {
    availability: 'source-only',
    method: 'GET',
    path: '/api/v1/kitchens/me/menu-items',
    supportedQueryParameters: [],
    purpose:
      'Menu identity/availability reconciliation with the canonical P92 Chef Menu contract.',
    limitations: [
      'No sales count, revenue, conversion, rank, or date-range performance fields.',
      'No authoritative top-items aggregation semantics.',
    ],
  },
} as const satisfies Record<string, ChefAnalyticsReconciliationSource>;

export interface ChefAnalyticsContractModel {
  guideReference: 46;
  status: 'blocked';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  capabilities: typeof CHEF_ANALYTICS_CAPABILITIES;
  reconciliationSources: typeof CHEF_ANALYTICS_RECONCILIATION_SOURCES;
}

export const CHEF_ANALYTICS_CONTRACT_MODEL: ChefAnalyticsContractModel = {
  guideReference: 46,
  status: 'blocked',
  code: 'BACKEND_CONTRACT_UNAVAILABLE',
  capabilities: CHEF_ANALYTICS_CAPABILITIES,
  reconciliationSources: CHEF_ANALYTICS_RECONCILIATION_SOURCES,
};

export function getUnavailableChefAnalyticsCapabilities(): ChefAnalyticsCapabilityKey[] {
  return (Object.keys(CHEF_ANALYTICS_CAPABILITIES) as ChefAnalyticsCapabilityKey[]).filter(
    key => CHEF_ANALYTICS_CAPABILITIES[key].availability === 'unavailable',
  );
}

export function hasCompleteChefAnalyticsContract(): boolean {
  return getUnavailableChefAnalyticsCapabilities().length === 0;
}
