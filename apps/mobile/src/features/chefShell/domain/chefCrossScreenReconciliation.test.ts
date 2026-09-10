import {CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT} from './chefCrossScreenReconciliation';

describe('Chef cross-screen reconciliation audit', () => {
  it('covers every P109 reconciliation area exactly once', () => {
    expect(Object.keys(CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT).sort()).toEqual(
      [
        'activeCards',
        'analyticsTotals',
        'identityVerification',
        'menuAvailability',
        'notifications',
        'orderCountsAndStatus',
        'payoutBalance',
      ].sort(),
    );
  });

  it('keeps unsupported financial and analytics state fail-closed', () => {
    const blocked = Object.entries(CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT)
      .filter(([, entry]) => entry.mode === 'blocked')
      .map(([area]) => area)
      .sort();

    expect(blocked).toEqual(['analyticsTotals', 'payoutBalance']);
    expect(
      CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.payoutBalance.blocker,
    ).toBeTruthy();
    expect(
      CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.analyticsTotals.blocker,
    ).toBeTruthy();
  });

  it('records real shared-cache/revalidation paths for supported Chef state', () => {
    expect(
      CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.orderCountsAndStatus.mode,
    ).toBe('shared-authoritative-cache');
    expect(CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.notifications.mode).toBe(
      'shared-authoritative-cache',
    );
    expect(CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.activeCards.mode).toBe(
      'shared-authoritative-cache',
    );
    expect(CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.menuAvailability.mode).toBe(
      'shared-authoritative-cache',
    );
    expect(
      CHEF_CROSS_SCREEN_RECONCILIATION_AUDIT.identityVerification.mode,
    ).toBe('revalidate-after-write');
  });
});
