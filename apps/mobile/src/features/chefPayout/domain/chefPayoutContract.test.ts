import {CHEF_EARNINGS_ROUTE} from '../api/chefPayoutApi';
import {
  CHEF_PAYOUT_CONTRACT_MODEL,
  getChefWithdrawEligibilityBoundary,
  hasCompleteChefPayoutContract,
} from './chefPayoutContract';

describe('chef payout contract boundary', () => {
  it('keeps the exact Chef earnings read as source-only rather than fabricating payout semantics', () => {
    expect(CHEF_PAYOUT_CONTRACT_MODEL.source).toMatchObject({
      availability: 'source-only',
      method: 'GET',
      path: CHEF_EARNINGS_ROUTE,
      response: 'ChefEarningLedgerEntry[]',
      query: {
        limit: {default: 100, minimum: 1, maximum: 500},
      },
    });
  });

  it('fails closed for every Guide-50 payout capability that lacks an exact Chef backend contract', () => {
    expect(
      Object.values(CHEF_PAYOUT_CONTRACT_MODEL.capabilities).every(
        capability =>
          capability.availability === 'unavailable' &&
          capability.code === 'BACKEND_CONTRACT_UNAVAILABLE',
      ),
    ).toBe(true);
    expect(hasCompleteChefPayoutContract()).toBe(false);
  });

  it('never promotes ledger rows into an available balance or withdrawal decision', () => {
    expect(CHEF_PAYOUT_CONTRACT_MODEL.capabilities.availableBalance.availability).toBe(
      'unavailable',
    );
    expect(getChefWithdrawEligibilityBoundary()).toMatchObject({
      availability: 'unavailable',
      code: 'BACKEND_CONTRACT_UNAVAILABLE',
      canWithdraw: false,
    });
  });

  it('does not expose a fabricated payout, bank, settlement, or withdraw endpoint', () => {
    const serialized = JSON.stringify(CHEF_PAYOUT_CONTRACT_MODEL);
    expect(serialized).not.toContain('/api/v1/chef/payout');
    expect(serialized).not.toContain('/api/v1/chef/withdraw');
    expect(serialized).not.toContain('/api/v1/chef/bank');
    expect(serialized).not.toContain('/api/v1/chef/settlements');
  });
});
