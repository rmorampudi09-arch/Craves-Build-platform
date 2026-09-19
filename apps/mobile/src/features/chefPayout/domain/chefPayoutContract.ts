import {
  CHEF_EARNINGS_MAX_LIMIT,
  CHEF_EARNINGS_ROUTE,
  CHEF_FINANCE_BALANCE_ROUTE,
  CHEF_WITHDRAWALS_ROUTE,
} from '../api/chefPayoutApi';

export type ChefPayoutCapabilityKey =
  | 'earningsSummary'
  | 'availableBalance'
  | 'payoutSeries'
  | 'payoutTransactions'
  | 'bankDestination'
  | 'withdrawEligibility'
  | 'withdrawInitiation'
  | 'transactionDetail';

export type ChefPayoutContractAvailability =
  | {
      availability: 'available';
      method: 'GET' | 'POST';
      path: string;
      notes: string;
    }
  | {
      availability: 'unavailable';
      code: 'BACKEND_CONTRACT_UNAVAILABLE';
      reason: string;
    };

export interface ChefPayoutSourceContract {
  availability: 'available';
  method: 'GET';
  path: typeof CHEF_EARNINGS_ROUTE;
  query: Readonly<{
    limit: Readonly<{
      default: 100;
      minimum: 1;
      maximum: typeof CHEF_EARNINGS_MAX_LIMIT;
    }>;
  }>;
  response: 'ChefEarningLedgerEntry[]';
  notes: string;
}

export interface ChefPayoutContractModel {
  status: 'partial';
  source: ChefPayoutSourceContract;
  capabilities: Readonly<Record<ChefPayoutCapabilityKey, ChefPayoutContractAvailability>>;
}

function unavailable(reason: string): ChefPayoutContractAvailability {
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason,
  };
}

function available(
  method: 'GET' | 'POST',
  path: string,
  notes: string,
): ChefPayoutContractAvailability {
  return {availability: 'available', method, path, notes};
}

/**
 * Guide Reference 50 requires a complete payout product contract. The current
 * backend exposes a Chef-owned earnings read plus a Chef-owned finance balance
 * read containing current balance/accounting fields and recent payout requests.
 * Unsupported product surfaces remain fail-closed.
 */
export const CHEF_PAYOUT_CONTRACT_MODEL: ChefPayoutContractModel = {
  status: 'partial',
  source: {
    availability: 'available',
    method: 'GET',
    path: CHEF_EARNINGS_ROUTE,
    query: {
      limit: {
        default: 100,
        minimum: 1,
        maximum: CHEF_EARNINGS_MAX_LIMIT,
      },
    },
    response: 'ChefEarningLedgerEntry[]',
    notes:
      'Published read-only Chef-owned earning ledger. It supports truthful ledger-row presentation only; it is not an available-balance, settlement batch, bank-destination, or withdrawal contract.',
  },
  capabilities: {
    earningsSummary: unavailable(
      'No Chef-role aggregate earnings-summary contract defines totals, periods, or aggregation semantics.',
    ),
    availableBalance: available(
      'GET',
      CHEF_FINANCE_BALANCE_ROUTE,
      'Server-authoritative available, outstanding and reserved/paid amounts. Mobile does not derive these values from earning rows.',
    ),
    payoutSeries: unavailable(
      'No Chef-role payout time-series/date-bucket contract exists.',
    ),
    payoutTransactions: available(
      'GET',
      CHEF_FINANCE_BALANCE_ROUTE,
      'The balance response includes up to 100 Chef-owned recent payout instructions with server-recorded status, channel and transfer reference.',
    ),
    bankDestination: unavailable(
      'No Chef-role payout bank-destination contract exists. Full bank identifiers must never be inferred or exposed; any future contract must provide an approved masked representation.',
    ),
    withdrawEligibility: available(
      'GET',
      CHEF_FINANCE_BALANCE_ROUTE,
      'Server-authoritative available amount, hold state, execution state and one-per-India-day request state.',
    ),
    withdrawInitiation: available(
      'POST',
      CHEF_WITHDRAWALS_ROUTE,
      'Requests the exact currently available amount using a stable UUID request key. Ambiguous outcomes must replay the same key.',
    ),
    transactionDetail: unavailable(
      'No Chef-role payout transaction-detail endpoint exists.',
    ),
  },
};

export function hasCompleteChefPayoutContract(
  model: ChefPayoutContractModel = CHEF_PAYOUT_CONTRACT_MODEL,
): boolean {
  return Object.values(model.capabilities).every(
    capability => capability.availability === 'available',
  );
}

export type ChefWithdrawEligibilityBoundary =
  | Readonly<{
      availability: 'available';
      canWithdraw: true;
      reason: string;
    }>
  | Readonly<{
      availability: 'unavailable';
      code: 'BACKEND_CONTRACT_UNAVAILABLE';
      canWithdraw: false;
      reason: string;
    }>;

export function getChefWithdrawEligibilityBoundary(
  model: ChefPayoutContractModel = CHEF_PAYOUT_CONTRACT_MODEL,
): ChefWithdrawEligibilityBoundary {
  const eligibility = model.capabilities.withdrawEligibility;
  const initiation = model.capabilities.withdrawInitiation;
  if (
    eligibility.availability === 'available' &&
    initiation.availability === 'available'
  ) {
    return {
      availability: 'available',
      canWithdraw: true,
      reason:
        'Eligibility is decided by the latest server balance response; mobile must honor hold, execution, daily-request and available-amount fields.',
    };
  }

  const unavailable =
    eligibility.availability === 'unavailable' ? eligibility : initiation;
  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    canWithdraw: false,
    reason:
      unavailable.availability === 'unavailable'
        ? unavailable.reason
        : 'Withdrawal contract is incomplete.',
  };
}
