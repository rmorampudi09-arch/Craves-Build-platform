import {
  CHEF_PAYOUT_HISTORY_MESSAGES,
  createChefPayoutHistoryBoundaryState,
  selectChefPayoutHistoryTab,
} from './chefPayoutHistoryBoundary';

describe('Chef payout history UI boundary', () => {
  it('starts with server-authoritative withdrawal capability but no invented trend/detail data', () => {
    const state = createChefPayoutHistoryBoundaryState();

    expect(state).toMatchObject({
      selectedTab: 'overview',
      dateRange: null,
      earningsSummary: null,
      availableBalance: null,
      payoutSeries: [],
      transactionsPage: null,
      withdrawState: 'available',
    });
    expect(state.withdrawEligibility.canWithdraw).toBe(true);
  });

  it('supports local tab selection without inventing unsupported payout series/detail state', () => {
    const initial = createChefPayoutHistoryBoundaryState();
    const transactions = selectChefPayoutHistoryTab(initial, 'transactions');

    expect(transactions.selectedTab).toBe('transactions');
    expect(transactions.payoutSeries).toEqual([]);
    expect(transactions.transactionsPage).toBeNull();
    expect(transactions.withdrawEligibility.canWithdraw).toBe(true);
  });

  it('describes the stable-key withdrawal safety boundary', () => {
    expect(CHEF_PAYOUT_HISTORY_MESSAGES.source).toContain(
      'Published Chef finance reads',
    );
    expect(CHEF_PAYOUT_HISTORY_MESSAGES.withdraw).toContain(
      'stable request UUID',
    );

    const serialized = JSON.stringify(CHEF_PAYOUT_HISTORY_MESSAGES);
    expect(serialized).not.toContain('/api/v1/chef/payout');
    expect(serialized).not.toContain('/api/v1/chef/withdraw');
    expect(serialized).not.toContain('/api/v1/chef/bank');
  });
});
