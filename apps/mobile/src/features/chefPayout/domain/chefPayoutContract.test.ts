import {
  CHEF_EARNINGS_ROUTE,
  CHEF_FINANCE_BALANCE_ROUTE,
  CHEF_WITHDRAWALS_ROUTE,
} from '../api/chefPayoutApi';
import {
  CHEF_PAYOUT_CONTRACT_MODEL,
  getChefWithdrawEligibilityBoundary,
  hasCompleteChefPayoutContract,
} from './chefPayoutContract';

describe('chef payout contract boundary', () => {
  it('keeps the published Chef earnings read separate from payout semantics', () => {
    expect(CHEF_PAYOUT_CONTRACT_MODEL.source).toMatchObject({
      availability: 'available',
      method: 'GET',
      path: CHEF_EARNINGS_ROUTE,
      response: 'ChefEarningLedgerEntry[]',
      query: {
        limit: {default: 100, minimum: 1, maximum: 200},
      },
    });
  });

  it('uses the published balance route for balance and recent payout history', () => {
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.availableBalance).toMatchObject({
      availability: 'available',
      method: 'GET',
      path: CHEF_FINANCE_BALANCE_ROUTE,
    });
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.payoutTransactions).toMatchObject({
      availability: 'available',
      method: 'GET',
      path: CHEF_FINANCE_BALANCE_ROUTE,
    });
  });

  it('keeps unsupported payout surfaces fail-closed', () => {
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.payoutSeries.availability).toBe(
      'unavailable',
    );
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.bankDestination.availability).toBe(
      'unavailable',
    );
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.transactionDetail.availability).toBe(
      'unavailable',
    );
    expect(hasCompleteChefPayoutContract()).toBe(false);
  });

  it('uses the published balance state and withdrawal route', () => {
    expect(getChefWithdrawEligibilityBoundary()).toMatchObject({
      availability: 'available',
      canWithdraw: true,
    });
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.withdrawEligibility).toMatchObject({
      availability: 'available',
      method: 'GET',
      path: CHEF_FINANCE_BALANCE_ROUTE,
    });
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.withdrawInitiation).toMatchObject({
      availability: 'available',
      method: 'POST',
      path: CHEF_WITHDRAWALS_ROUTE,
    });
  });

  it('does not fabricate alternate payout, bank, or settlement endpoints', () => {
    const serialized = JSON.stringify(CHEF_PAYOUT_CONTRACT_MODEL);
    expect(serialized).not.toContain('/api/v1/chef/payout');
    expect(serialized).not.toContain('/api/v1/chef/withdraw');
    expect(serialized).not.toContain('/api/v1/chef/bank');
    expect(serialized).not.toContain('/api/v1/chef/settlements');
  });
});
