import {
  CHEF_EARNINGS_MAX_LIMIT,
  CHEF_EARNINGS_ROUTE,
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
  availability: 'source-only';
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
  status: 'blocked';
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

/**
 * Guide Reference 50 requires a complete payout product contract. The current
 * backend exposes only a Chef-owned earning-ledger read. It intentionally does
 * not send money and exposes settlement operations only to finance/admin roles.
 * Keep all unsupported payout capabilities fail-closed until exact Chef-role
 * contracts exist.
 */
export const CHEF_PAYOUT_CONTRACT_MODEL: ChefPayoutContractModel = {
  status: 'blocked',
  source: {
    availability: 'source-only',
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
      'Chef-owned financial allocation ledger. It can support truthful ledger-row presentation/reconciliation only; it is not a payout summary, balance, transaction-history, bank, or withdrawal contract.',
  },
  capabilities: {
    earningsSummary: unavailable(
      'No Chef-role aggregate earnings-summary contract defines totals, periods, or aggregation semantics.',
    ),
    availableBalance: unavailable(
      'No Chef-role available/withdrawable balance contract exists. Mobile must not derive a wallet balance by summing ledger rows.',
    ),
    payoutSeries: unavailable(
      'No Chef-role payout time-series/date-bucket contract exists.',
    ),
    payoutTransactions: unavailable(
      'The Chef earnings ledger does not expose settlement batch/payment-provider transaction history or payout statuses as a Chef transaction contract.',
    ),
    bankDestination: unavailable(
      'No Chef-role payout bank-destination contract exists. Full bank identifiers must never be inferred or exposed; any future contract must provide an approved masked representation.',
    ),
    withdrawEligibility: unavailable(
      'No Chef-role withdrawal-eligibility contract or authoritative minimum/verification rule exists.',
    ),
    withdrawInitiation: unavailable(
      'No Chef-role withdrawal initiation endpoint exists. Current settlement operations are ADMIN-only and the financial-ledger module explicitly does not send money.',
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
