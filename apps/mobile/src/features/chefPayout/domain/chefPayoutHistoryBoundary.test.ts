import {
  CHEF_PAYOUT_HISTORY_MESSAGES,
  createChefPayoutHistoryBoundaryState,
  selectChefPayoutHistoryTab,
} from './chefPayoutHistoryBoundary';

describe('Chef payout history UI boundary', () => {
  it('starts without inventing payout money, trend, transactions, or date semantics', () => {
    const state = createChefPayoutHistoryBoundaryState();

    expect(state).toMatchObject({
      selectedTab: 'overview',
      dateRange: null,
      earningsSummary: null,
      availableBalance: null,
      payoutSeries: [],
      transactionsPage: null,
      withdrawState: 'blocked',
    });
    expect(state.withdrawEligibility.canWithdraw).toBe(false);
  });

  it('supports only local tab selection while server-owned payout state stays fail-closed', () => {
    const initial = createChefPayoutHistoryBoundaryState();
    const transactions = selectChefPayoutHistoryTab(initial, 'transactions');

    expect(transactions.selectedTab).toBe('transactions');
    expect(transactions.availableBalance).toBeNull();
    expect(transactions.transactionsPage).toBeNull();
    expect(transactions.withdrawEligibility.canWithdraw).toBe(false);
  });

  it('explains the exact blocked integration instead of fabricating a payout route', () => {
    expect(CHEF_PAYOUT_HISTORY_MESSAGES.source).toContain('approved mobile APIM');
    expect(CHEF_PAYOUT_HISTORY_MESSAGES.withdraw).toContain('No Chef-role');

    const serialized = JSON.stringify(CHEF_PAYOUT_HISTORY_MESSAGES);
    expect(serialized).not.toContain('/api/v1/chef/payout');
    expect(serialized).not.toContain('/api/v1/chef/withdraw');
    expect(serialized).not.toContain('/api/v1/chef/bank');
  });
});
