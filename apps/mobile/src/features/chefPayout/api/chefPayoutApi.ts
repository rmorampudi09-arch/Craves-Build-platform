import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MONEY_PATTERN = /^-?\d{1,14}(?:\.\d{1,2})?$/;

/** Exact Integration Service/APIM read route on current main. Mobile treats
 * every money field as server-authoritative and never recomputes settlement. */
export const CHEF_EARNINGS_ROUTE = '/api/v1/chef/earnings' as const;
export const CHEF_EARNINGS_DEFAULT_LIMIT = 100;
export const CHEF_EARNINGS_MAX_LIMIT = 200;
export const CHEF_FINANCE_BALANCE_ROUTE =
  '/api/v1/chef/finance/balance' as const;
export const CHEF_WITHDRAWALS_ROUTE =
  '/api/v1/chef/finance/withdrawals' as const;

export type ChefPayoutMode = 'MANUAL' | 'AUTOMATIC';
export type ChefPayoutChannel = 'RAZORPAYX' | 'CRAVES_MANUAL';
export type ChefPayoutStatus =
  | 'RESERVED'
  | 'SUBMITTING'
  | 'PROCESSING'
  | 'UNKNOWN'
  | 'PAID'
  | 'FAILED'
  | 'REVERSED'
  | 'REVIEW_REQUIRED'
  | 'CANCELLED';

export interface ChefPayoutTransaction {
  id: string;
  amount: ChefMoneyDecimal;
  mode: ChefPayoutMode;
  status: ChefPayoutStatus;
  providerStatus: string | null;
  transferReference: string | null;
  createdAt: string;
  payoutChannel: ChefPayoutChannel;
}

export interface ChefAccountingSummary {
  recordedOrders: number;
  grossFood: ChefMoneyDecimal;
  totalServiceFee: ChefMoneyDecimal;
  feeBeforeGst: ChefMoneyDecimal;
  feeGst: ChefMoneyDecimal;
  withholding: ChefMoneyDecimal;
  originalNetEarnings: ChefMoneyDecimal;
  recordedPayments: ChefMoneyDecimal;
  outstanding: ChefMoneyDecimal;
  otherLedgerMovements: ChefMoneyDecimal;
  legacyRecords: number;
}

export interface ChefWithdrawalRequest {
  requestKey: string;
  expectedAvailableAmount: ChefMoneyDecimal;
}

export interface ChefFinanceBalance {
  available: ChefMoneyDecimal;
  outstanding: ChefMoneyDecimal;
  reservedOrPaid: ChefMoneyDecimal;
  onHold: boolean;
  manualRequestUsedToday: boolean;
  nextManualRequestAt: string;
  recentPayouts: ChefPayoutTransaction[];
  executionEnabled: boolean;
  payoutMode: ChefPayoutChannel;
  accounting: ChefAccountingSummary;
}

export type ChefEarningOrderSource = 'ON_DEMAND' | 'SUBSCRIPTION';
export type ChefEarningStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'REVERSED';

/**
 * Canonical decimal representation of a backend-owned financial amount.
 * Mobile must display/reconcile these values, not recompute payout accounting.
 */
export type ChefMoneyDecimal = string;

export interface ChefEarningLedgerEntry {
  id: string;
  orderId: string;
  chefIdentityId: string;
  orderSource: ChefEarningOrderSource;
  currency: string;
  grossAmount: ChefMoneyDecimal;
  commissionAmount: ChefMoneyDecimal;
  taxWithheldAmount: ChefMoneyDecimal;
  adjustmentAmount: ChefMoneyDecimal;
  netPayable: ChefMoneyDecimal;
  allocationReference: string;
  status: ChefEarningStatus;
  reason: string;
  approvedAt: string | null;
  reversedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const ORDER_SOURCES = new Set<ChefEarningOrderSource>([
  'ON_DEMAND',
  'SUBSCRIPTION',
]);
const EARNING_STATUSES = new Set<ChefEarningStatus>([
  'DRAFT',
  'APPROVED',
  'SETTLEMENT_PENDING',
  'SETTLED',
  'REVERSED',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const EARNING_RESPONSE_KEYS = new Set([
  'id',
  'orderId',
  'chefIdentityId',
  'orderSource',
  'currency',
  'grossAmount',
  'commissionAmount',
  'taxWithheldAmount',
  'adjustmentAmount',
  'netPayable',
  'allocationReference',
  'status',
  'reason',
  'approvedAt',
  'reversedAt',
  'createdAt',
  'updatedAt',
]);

function hasOnlyEarningResponseKeys(raw: Record<string, unknown>): boolean {
  const keys = Object.keys(raw);
  return (
    keys.length === EARNING_RESPONSE_KEYS.size &&
    keys.every(key => EARNING_RESPONSE_KEYS.has(key))
  );
}

const PAYOUT_STATUSES = new Set<ChefPayoutStatus>([
  'RESERVED',
  'SUBMITTING',
  'PROCESSING',
  'UNKNOWN',
  'PAID',
  'FAILED',
  'REVERSED',
  'REVIEW_REQUIRED',
  'CANCELLED',
]);
const PAYOUT_MODES = new Set<ChefPayoutMode>(['MANUAL', 'AUTOMATIC']);
const PAYOUT_CHANNELS = new Set<ChefPayoutChannel>([
  'RAZORPAYX',
  'CRAVES_MANUAL',
]);

const BALANCE_KEYS = new Set([
  'available',
  'outstanding',
  'reservedOrPaid',
  'onHold',
  'manualRequestUsedToday',
  'nextManualRequestAt',
  'recentPayouts',
  'executionEnabled',
  'payoutMode',
  'accounting',
]);

const PAYOUT_KEYS = new Set([
  'id',
  'amount',
  'mode',
  'status',
  'providerStatus',
  'transferReference',
  'createdAt',
  'payoutChannel',
]);

const ACCOUNTING_KEYS = new Set([
  'recordedOrders',
  'grossFood',
  'totalServiceFee',
  'feeBeforeGst',
  'feeGst',
  'withholding',
  'originalNetEarnings',
  'recordedPayments',
  'outstanding',
  'otherLedgerMovements',
  'legacyRecords',
]);

function hasExactKeys(
  raw: Record<string, unknown>,
  expected: Set<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function requiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalTimestamp(value: unknown): string | null | undefined {
  if (value == null || value === '') {
    return null;
  }
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function requiredTimestamp(value: unknown): string | null {
  const parsed = optionalTimestamp(value);
  return typeof parsed === 'string' ? parsed : null;
}

function normalizeMoney(
  value: unknown,
  allowNegative: boolean,
): ChefMoneyDecimal | null {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }

  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!raw || !MONEY_PATTERN.test(raw)) {
    return null;
  }

  const negative = raw.startsWith('-');
  if (negative && !allowNegative) {
    return null;
  }

  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  const normalized = `${whole}.${fraction.padEnd(2, '0')}`;
  return negative ? `-${normalized}` : normalized;
}

export function buildChefWithdrawalRequest(
  requestKey: string,
  expectedAvailableAmount: string,
): ChefWithdrawalRequest {
  if (!UUID_PATTERN.test(requestKey)) {
    throw new Error('CHEF_WITHDRAWAL_INVALID_REQUEST_KEY');
  }
  const amount = normalizeMoney(expectedAvailableAmount, false);
  if (!amount || Number(amount) <= 0) {
    throw new Error('CHEF_WITHDRAWAL_INVALID_AMOUNT');
  }
  return {requestKey, expectedAvailableAmount: amount};
}

export function parseChefPayoutTransaction(
  value: unknown,
): ChefPayoutTransaction | null {
  const raw = asRecord(value);
  if (!raw || !hasExactKeys(raw, PAYOUT_KEYS)) return null;

  const id = requiredString(raw.id, 64);
  const amount = normalizeMoney(raw.amount, false);
  const mode = requiredString(raw.mode, 20) as ChefPayoutMode | null;
  const status = requiredString(raw.status, 40) as ChefPayoutStatus | null;
  const providerStatus =
    raw.providerStatus == null
      ? null
      : requiredString(raw.providerStatus, 120);
  const transferReference =
    raw.transferReference == null
      ? null
      : requiredString(raw.transferReference, 240);
  const createdAt = requiredTimestamp(raw.createdAt);
  const payoutChannel = requiredString(
    raw.payoutChannel,
    40,
  ) as ChefPayoutChannel | null;

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    amount === null ||
    !mode ||
    !PAYOUT_MODES.has(mode) ||
    !status ||
    !PAYOUT_STATUSES.has(status) ||
    (raw.providerStatus != null && !providerStatus) ||
    (raw.transferReference != null && !transferReference) ||
    !createdAt ||
    !payoutChannel ||
    !PAYOUT_CHANNELS.has(payoutChannel)
  ) {
    return null;
  }

  return {
    id,
    amount,
    mode,
    status,
    providerStatus,
    transferReference,
    createdAt,
    payoutChannel,
  };
}

function parseAccountingSummary(value: unknown): ChefAccountingSummary | null {
  const raw = asRecord(value);
  if (!raw || !hasExactKeys(raw, ACCOUNTING_KEYS)) return null;

  const recordedOrders = raw.recordedOrders;
  const legacyRecords = raw.legacyRecords;
  const grossFood = normalizeMoney(raw.grossFood, false);
  const totalServiceFee = normalizeMoney(raw.totalServiceFee, false);
  const feeBeforeGst = normalizeMoney(raw.feeBeforeGst, false);
  const feeGst = normalizeMoney(raw.feeGst, false);
  const withholding = normalizeMoney(raw.withholding, false);
  const originalNetEarnings = normalizeMoney(raw.originalNetEarnings, false);
  const recordedPayments = normalizeMoney(raw.recordedPayments, false);
  const outstanding = normalizeMoney(raw.outstanding, true);
  const otherLedgerMovements = normalizeMoney(raw.otherLedgerMovements, true);

  if (
    typeof recordedOrders !== 'number' ||
    !Number.isSafeInteger(recordedOrders) ||
    recordedOrders < 0 ||
    typeof legacyRecords !== 'number' ||
    !Number.isSafeInteger(legacyRecords) ||
    legacyRecords < 0 ||
    grossFood === null ||
    totalServiceFee === null ||
    feeBeforeGst === null ||
    feeGst === null ||
    withholding === null ||
    originalNetEarnings === null ||
    recordedPayments === null ||
    outstanding === null ||
    otherLedgerMovements === null
  ) {
    return null;
  }

  const paise = (amount: string) =>
    BigInt(amount.replace('.', ''));
  if (
    paise(totalServiceFee) !== paise(feeBeforeGst) + paise(feeGst) ||
    paise(grossFood) !==
      paise(totalServiceFee) + paise(withholding) + paise(originalNetEarnings) ||
    paise(outstanding) !==
      paise(originalNetEarnings) +
        paise(otherLedgerMovements) -
        paise(recordedPayments)
  ) {
    return null;
  }

  return {
    recordedOrders,
    grossFood,
    totalServiceFee,
    feeBeforeGst,
    feeGst,
    withholding,
    originalNetEarnings,
    recordedPayments,
    outstanding,
    otherLedgerMovements,
    legacyRecords,
  };
}

export function parseChefFinanceBalance(
  value: unknown,
): ChefFinanceBalance | null {
  const raw = asRecord(value);
  if (!raw || !hasExactKeys(raw, BALANCE_KEYS)) return null;

  const available = normalizeMoney(raw.available, false);
  const outstanding = normalizeMoney(raw.outstanding, true);
  const reservedOrPaid = normalizeMoney(raw.reservedOrPaid, false);
  const nextManualRequestAt = requiredTimestamp(raw.nextManualRequestAt);
  const payoutMode = requiredString(
    raw.payoutMode,
    40,
  ) as ChefPayoutChannel | null;
  const accounting = parseAccountingSummary(raw.accounting);
  if (
    available === null ||
    outstanding === null ||
    reservedOrPaid === null ||
    typeof raw.onHold !== 'boolean' ||
    typeof raw.manualRequestUsedToday !== 'boolean' ||
    !nextManualRequestAt ||
    !Array.isArray(raw.recentPayouts) ||
    raw.recentPayouts.length > 100 ||
    typeof raw.executionEnabled !== 'boolean' ||
    !payoutMode ||
    !PAYOUT_CHANNELS.has(payoutMode) ||
    !accounting
  ) {
    return null;
  }

  const recentPayouts = raw.recentPayouts.map(parseChefPayoutTransaction);
  if (recentPayouts.some(item => item === null)) return null;
  const payouts = recentPayouts as ChefPayoutTransaction[];
  if (new Set(payouts.map(item => item.id)).size !== payouts.length) {
    return null;
  }

  return {
    available,
    outstanding,
    reservedOrPaid,
    onHold: raw.onHold,
    manualRequestUsedToday: raw.manualRequestUsedToday,
    nextManualRequestAt,
    recentPayouts: payouts,
    executionEnabled: raw.executionEnabled,
    payoutMode,
    accounting,
  };
}

export function normalizeChefEarningsLimit(limit: number): number {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > CHEF_EARNINGS_MAX_LIMIT
  ) {
    throw new Error(
      `Chef earnings limit must be an integer from 1 to ${CHEF_EARNINGS_MAX_LIMIT}.`,
    );
  }
  return limit;
}

export function parseChefEarningLedgerEntry(
  value: unknown,
): ChefEarningLedgerEntry | null {
  const raw = asRecord(value);
  if (!raw || !hasOnlyEarningResponseKeys(raw)) {
    return null;
  }

  const id = requiredString(raw.id, 64);
  const orderId = requiredString(raw.orderId, 64);
  const chefIdentityId = requiredString(raw.chefIdentityId, 64);
  const orderSource = requiredString(
    raw.orderSource,
    30,
  ) as ChefEarningOrderSource | null;
  const currency = requiredString(raw.currency, 3);
  const grossAmount = normalizeMoney(raw.grossAmount, false);
  const commissionAmount = normalizeMoney(raw.commissionAmount, false);
  const taxWithheldAmount = normalizeMoney(raw.taxWithheldAmount, false);
  const adjustmentAmount = normalizeMoney(raw.adjustmentAmount, true);
  const netPayable = normalizeMoney(raw.netPayable, false);
  const allocationReference = requiredString(raw.allocationReference, 160);
  const status = requiredString(raw.status, 40) as ChefEarningStatus | null;
  const reason = requiredString(raw.reason, 1000);
  const approvedAt = optionalTimestamp(raw.approvedAt);
  const reversedAt = optionalTimestamp(raw.reversedAt);
  const createdAt = requiredTimestamp(raw.createdAt);
  const updatedAt = requiredTimestamp(raw.updatedAt);

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !orderId ||
    !UUID_PATTERN.test(orderId) ||
    !chefIdentityId ||
    !UUID_PATTERN.test(chefIdentityId) ||
    !orderSource ||
    !ORDER_SOURCES.has(orderSource) ||
    !currency ||
    !CURRENCY_PATTERN.test(currency) ||
    grossAmount === null ||
    commissionAmount === null ||
    taxWithheldAmount === null ||
    adjustmentAmount === null ||
    netPayable === null ||
    !allocationReference ||
    !status ||
    !EARNING_STATUSES.has(status) ||
    !reason ||
    approvedAt === undefined ||
    reversedAt === undefined ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    orderId,
    chefIdentityId,
    orderSource,
    currency,
    grossAmount,
    commissionAmount,
    taxWithheldAmount,
    adjustmentAmount,
    netPayable,
    allocationReference,
    status,
    reason,
    approvedAt,
    reversedAt,
    createdAt,
    updatedAt,
  };
}

export function parseChefEarningLedger(
  value: unknown,
): ChefEarningLedgerEntry[] | null {
  if (!Array.isArray(value) || value.length > CHEF_EARNINGS_MAX_LIMIT) {
    return null;
  }

  const parsed = value.map(parseChefEarningLedgerEntry);
  if (parsed.some(entry => entry === null)) {
    return null;
  }

  const entries = parsed as ChefEarningLedgerEntry[];
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    return null;
  }

  return entries;
}


export const chefPayoutApi = {
  async requestWithdrawal(
    requestKey: string,
    expectedAvailableAmount: string,
    signal?: AbortSignal,
  ): Promise<ChefPayoutTransaction> {
    const response = await httpClient.post<unknown>(
      CHEF_WITHDRAWALS_ROUTE,
      buildChefWithdrawalRequest(requestKey, expectedAvailableAmount),
      {signal},
    );
    const parsed = parseChefPayoutTransaction(response);
    if (!parsed) {
      throw new Error('CHEF_WITHDRAWAL_INVALID_RESPONSE');
    }
    return parsed;
  },

  async getBalance(signal?: AbortSignal): Promise<ChefFinanceBalance> {
    const response = await httpClient.get<unknown>(CHEF_FINANCE_BALANCE_ROUTE, {
      signal,
      dedupeKey: 'chef-finance-balance',
    });
    const parsed = parseChefFinanceBalance(response);
    if (!parsed) {
      throw new Error('CHEF_FINANCE_BALANCE_INVALID_RESPONSE');
    }
    return parsed;
  },

  async listEarnings(
    limit = CHEF_EARNINGS_DEFAULT_LIMIT,
    signal?: AbortSignal,
  ): Promise<ChefEarningLedgerEntry[]> {
    const bounded = normalizeChefEarningsLimit(limit);
    const response = await httpClient.get<unknown>(
      `${CHEF_EARNINGS_ROUTE}?limit=${bounded}`,
      {signal, dedupeKey: `chef-earnings:${bounded}`},
    );
    const parsed = parseChefEarningLedger(response);
    if (!parsed) {
      throw new Error('CHEF_EARNINGS_INVALID_RESPONSE');
    }
    return parsed;
  },
};
