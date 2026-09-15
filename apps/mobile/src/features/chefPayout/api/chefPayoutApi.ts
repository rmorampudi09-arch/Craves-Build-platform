const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MONEY_PATTERN = /^-?\d{1,10}(?:\.\d{1,2})?$/;

/**
 * Exact Integration Service backend path audited for P103. The current branch
 * does not expose a corresponding approved APIM mobile operation, so this
 * module deliberately does not create a runtime HTTP wrapper for it.
 */
export const CHEF_EARNINGS_ROUTE = '/api/v1/chef/earnings' as const;
export const CHEF_EARNINGS_DEFAULT_LIMIT = 100;
export const CHEF_EARNINGS_MAX_LIMIT = 500;

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
  if (!raw) {
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
