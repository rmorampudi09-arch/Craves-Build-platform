import {
  CHEF_EARNINGS_MAX_LIMIT,
  CHEF_EARNINGS_ROUTE,
  CHEF_FINANCE_BALANCE_ROUTE,
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
    withdrawEligibility: unavailable(
      'The balance response exposes hold, daily-request and execution flags, but this mobile read-only step does not enable withdrawal decisions.',
    ),
    withdrawInitiation: unavailable(
      'Main publishes POST /api/v1/chef/finance/withdrawals, but this read-only mobile step intentionally does not invoke a money-moving endpoint.',
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

export type ChefWithdrawEligibilityBoundary = Readonly<{
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  canWithdraw: false;
  reason: string;
}>;

export function getChefWithdrawEligibilityBoundary(
  model: ChefPayoutContractModel = CHEF_PAYOUT_CONTRACT_MODEL,
): ChefWithdrawEligibilityBoundary {
  const capability = model.capabilities.withdrawEligibility;
  if (capability.availability === 'unavailable') {
    return {
      availability: 'unavailable',
      code: capability.code,
      canWithdraw: false,
      reason: capability.reason,
    };
  }

  return {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    canWithdraw: false,
    reason:
      'Withdrawal remains disabled until eligibility and initiation are both represented by exact Chef-role backend contracts.',
  };
}
