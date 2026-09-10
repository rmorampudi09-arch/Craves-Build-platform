import {
  CHEF_ANALYTICS_METRICS,
  CHEF_ANALYTICS_REFERENCE_RANGE_OPTIONS,
  chefAnalyticsUnavailableAccessibilityLabel,
  getChefAnalyticsBlockedPresentation,
} from './chefAnalyticsPresentation';

describe('Chef Analytics blocked presentation', () => {
  it('preserves all Guide-46 KPI slots without manufacturing numeric values or trends', () => {
    const model = getChefAnalyticsBlockedPresentation();

    expect(model.metrics).toHaveLength(CHEF_ANALYTICS_METRICS.length);
    expect(
      model.metrics.every(
        metric =>
          metric.value === null &&
          metric.trend === null &&
          metric.interactive === false,
      ),
    ).toBe(true);
    expect(JSON.stringify(model.metrics)).not.toContain('"value":0');
  });

  it('keeps chart, comparison, item-ranking, and report data unavailable at the P96 contract boundary', () => {
    const model = getChefAnalyticsBlockedPresentation();

    expect(model.earningsSeries).toBeNull();
    expect(model.orderStatusBreakdown).toBeNull();
    expect(model.topItems).toBeNull();
    expect(model.comparisonPeriod).toBeNull();
    expect(model.detailedReportAvailable).toBe(false);
    expect(model.unavailableCapabilities).toHaveLength(9);
  });

  it('uses reference-only range labels without inventing request date or timezone semantics', () => {
    const model = getChefAnalyticsBlockedPresentation();
    const serializedRanges = JSON.stringify(CHEF_ANALYTICS_REFERENCE_RANGE_OPTIONS);

    expect(model.selectedReferenceRange).toBe('this-week');
    expect(model.dateRangeInteractionAvailable).toBe(false);
    expect(CHEF_ANALYTICS_REFERENCE_RANGE_OPTIONS.map(option => option.label)).toEqual([
      'This week',
      'Custom',
    ]);
    expect(serializedRanges).not.toContain('from');
    expect(serializedRanges).not.toContain('toDate');
    expect(serializedRanges).not.toContain('timezone');
    expect(serializedRanges).not.toContain('comparison');
  });

  it('provides an accessible explanation instead of an ambiguous dash-only state', () => {
    expect(chefAnalyticsUnavailableAccessibilityLabel('Earnings')).toContain(
      'Earnings unavailable',
    );
    expect(chefAnalyticsUnavailableAccessibilityLabel('Earnings')).toContain(
      'No estimate is shown',
    );
  });
});
