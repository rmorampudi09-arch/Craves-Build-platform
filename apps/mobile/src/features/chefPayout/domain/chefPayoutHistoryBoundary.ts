import {
  CHEF_PAYOUT_CONTRACT_MODEL,
  getChefWithdrawEligibilityBoundary,
  type ChefWithdrawEligibilityBoundary,
} from './chefPayoutContract';

export type ChefPayoutHistoryTab = 'overview' | 'transactions';

export interface ChefPayoutHistoryBoundaryState {
  selectedTab: ChefPayoutHistoryTab;
  dateRange: null;
  earningsSummary: null;
  availableBalance: null;
  payoutSeries: readonly never[];
  transactionsPage: null;
  withdrawEligibility: ChefWithdrawEligibilityBoundary;
  withdrawState: 'blocked';
}

const sourceOnlyMessage =
  'The exact Chef earnings ledger exists in backend source, but this branch has no approved mobile APIM operation for it. Craves will not bypass APIM or substitute local financial data.';

export const CHEF_PAYOUT_HISTORY_MESSAGES = {
  source: sourceOnlyMessage,
  earningsSummary:
    CHEF_PAYOUT_CONTRACT_MODEL.capabilities.earningsSummary.availability === 'unavailable'
      ? CHEF_PAYOUT_CONTRACT_MODEL.capabilities.earningsSummary.reason
      : sourceOnlyMessage,
  availableBalance:
    CHEF_PAYOUT_CONTRACT_MODEL.capabilities.availableBalance.availability === 'unavailable'
      ? CHEF_PAYOUT_CONTRACT_MODEL.capabilities.availableBalance.reason
      : sourceOnlyMessage,
  payoutSeries:
    CHEF_PAYOUT_CONTRACT_MODEL.capabilities.payoutSeries.availability === 'unavailable'
      ? CHEF_PAYOUT_CONTRACT_MODEL.capabilities.payoutSeries.reason
      : sourceOnlyMessage,
  payoutTransactions:
    CHEF_PAYOUT_CONTRACT_MODEL.capabilities.payoutTransactions.availability === 'unavailable'
      ? CHEF_PAYOUT_CONTRACT_MODEL.capabilities.payoutTransactions.reason
      : sourceOnlyMessage,
  transactionDetail:
    CHEF_PAYOUT_CONTRACT_MODEL.capabilities.transactionDetail.availability === 'unavailable'
      ? CHEF_PAYOUT_CONTRACT_MODEL.capabilities.transactionDetail.reason
      : sourceOnlyMessage,
  dateFilter:
    'Date filtering remains unavailable until the payout trend or payout-transaction contract defines authoritative range and bucket semantics.',
  withdraw: `${
    CHEF_PAYOUT_CONTRACT_MODEL.capabilities.withdrawEligibility.availability === 'unavailable'
      ? CHEF_PAYOUT_CONTRACT_MODEL.capabilities.withdrawEligibility.reason
      : 'Withdrawal eligibility is unavailable.'
  } ${
    CHEF_PAYOUT_CONTRACT_MODEL.capabilities.withdrawInitiation.availability === 'unavailable'
      ? CHEF_PAYOUT_CONTRACT_MODEL.capabilities.withdrawInitiation.reason
      : 'Withdrawal initiation is unavailable.'
  }`,
} as const;

export function createChefPayoutHistoryBoundaryState(): ChefPayoutHistoryBoundaryState {
  return {
    selectedTab: 'overview',
    dateRange: null,
    earningsSummary: null,
    availableBalance: null,
    payoutSeries: [],
    transactionsPage: null,
    withdrawEligibility: getChefWithdrawEligibilityBoundary(),
    withdrawState: 'blocked',
  };
}

export function selectChefPayoutHistoryTab(
  state: ChefPayoutHistoryBoundaryState,
  selectedTab: ChefPayoutHistoryTab,
): ChefPayoutHistoryBoundaryState {
  if (state.selectedTab === selectedTab) {
    return state;
  }
  return {...state, selectedTab};
}
