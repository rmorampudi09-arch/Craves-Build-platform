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
  withdrawState: 'available' | 'blocked';
}

const sourceOnlyMessage =
  'Published Chef finance reads provide your earning ledger, server-recorded balance/accounting data and recent payout request statuses. Bank destination and money-moving actions remain separate.';

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
  withdraw:
    getChefWithdrawEligibilityBoundary().availability === 'available'
      ? 'Withdrawal requests use the exact server available balance and a stable request UUID. A request is not a confirmed bank payment until its status is PAID.'
      : getChefWithdrawEligibilityBoundary().reason,
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
    withdrawState:
      getChefWithdrawEligibilityBoundary().availability === 'available'
        ? 'available'
        : 'blocked',
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
