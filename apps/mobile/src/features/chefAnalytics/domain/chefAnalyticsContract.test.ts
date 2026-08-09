import {
  CHEF_ANALYTICS_CAPABILITIES,
  CHEF_ANALYTICS_CONTRACT_MODEL,
  CHEF_ANALYTICS_RECONCILIATION_SOURCES,
  getUnavailableChefAnalyticsCapabilities,
  hasCompleteChefAnalyticsContract,
} from './chefAnalyticsContract';

describe('Chef Analytics contract model', () => {
  it('fails closed for every Guide-46 analytics capability without an approved backend contract', () => {
    expect(getUnavailableChefAnalyticsCapabilities()).toEqual([
      'summaryKpis',
      'dateRangeFiltering',
      'earningsSeries',
      'orderStatusMetrics',
      'itemPerformance',
      'customerMetrics',
      'ratingMetrics',
      'comparisonPeriod',
      'reportDetailExport',
    ]);
    expect(hasCompleteChefAnalyticsContract()).toBe(false);
    expect(CHEF_ANALYTICS_CONTRACT_MODEL.status).toBe('blocked');
    expect(
      Object.values(CHEF_ANALYTICS_CAPABILITIES).every(
        capability =>
          capability.availability === 'unavailable' &&
          capability.code === 'BACKEND_CONTRACT_UNAVAILABLE',
      ),
    ).toBe(true);
  });

  it('classifies existing Chef reads as reconciliation sources rather than analytics metrics', () => {
    expect(CHEF_ANALYTICS_RECONCILIATION_SOURCES.orders).toEqual(
      expect.objectContaining({
        availability: 'source-only',
        method: 'GET',
        path: '/api/v1/chef/orders',
        supportedQueryParameters: [],
      }),
    );
    expect(CHEF_ANALYTICS_RECONCILIATION_SOURCES.earnings).toEqual(
      expect.objectContaining({
        availability: 'source-only',
        method: 'GET',
        path: '/api/v1/chef/earnings',
        supportedQueryParameters: ['limit'],
      }),
    );
    expect(CHEF_ANALYTICS_RECONCILIATION_SOURCES.menu).toEqual(
      expect.objectContaining({
        availability: 'source-only',
        method: 'GET',
        path: '/api/v1/kitchens/me/menu-items',
        supportedQueryParameters: [],
      }),
    );
  });

  it('does not expose a fabricated analytics endpoint through the contract model', () => {
    const serialized = JSON.stringify(CHEF_ANALYTICS_CONTRACT_MODEL);
    expect(serialized).not.toContain('/analytics');
    expect(serialized).not.toContain('averageOrderValue');
    expect(serialized).not.toContain('topItems');
  });
});
