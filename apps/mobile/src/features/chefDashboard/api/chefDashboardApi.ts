import {
  chefMenuApi,
  parseChefMenuItem,
  parseChefMenuItems,
  type ChefMenuFoodType,
  type ChefMenuItem,
  type ChefMenuItemImage,
  type ChefMenuItemStatus,
  type ChefMenuSpiceLevel,
} from '../../chefMenu/api/chefMenuApi';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChefEarningStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'REVERSED';

export type ChefEarningOrderSource = 'ON_DEMAND' | 'SUBSCRIPTION';

export interface ChefDashboardEarning {
  id: string;
  orderId: string;
  orderSource: ChefEarningOrderSource;
  currency: string;
  grossAmount: number;
  commissionAmount: number;
  taxWithheldAmount: number;
  adjustmentAmount: number;
  netPayable: number;
  allocationReference: string;
  status: ChefEarningStatus;
  reason: string;
  approvedAt: string | null;
  reversedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Backward-compatible aliases; Chef Menu owns the canonical transport model from P92 onward. */
export type ChefDashboardMenuItemStatus = ChefMenuItemStatus;
export type ChefDashboardFoodType = ChefMenuFoodType;
export type ChefDashboardSpiceLevel = ChefMenuSpiceLevel;
export type ChefDashboardMenuImage = ChefMenuItemImage;
export type ChefDashboardMenuItem = ChefMenuItem;

export const CHEF_DASHBOARD_EARNINGS_CONTRACT_GAP = {
  availability: 'unavailable',
  code: 'BACKEND_CONTRACT_UNAVAILABLE',
  route: '/api/v1/chef/earnings',
  reason:
    'Chef earnings has a backend route but no approved APIM mobile operation on this branch. P119 blocks the network call until an APIM contract is published.',
} as const;

export class ChefDashboardContractUnavailableError extends Error {
  readonly code = CHEF_DASHBOARD_EARNINGS_CONTRACT_GAP.code;

  constructor() {
    super(CHEF_DASHBOARD_EARNINGS_CONTRACT_GAP.reason);
    this.name = 'ChefDashboardContractUnavailableError';
  }
}

const EARNING_STATUSES = new Set<ChefEarningStatus>([
  'DRAFT',
  'APPROVED',
  'SETTLEMENT_PENDING',
  'SETTLED',
  'REVERSED',
]);
const EARNING_SOURCES = new Set<ChefEarningOrderSource>([
  'ON_DEMAND',
  'SUBSCRIPTION',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function validTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value == null) {
    return null;
  }
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function money(value: unknown, allowNegative = false): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000) {
    return null;
  }
  return allowNegative || parsed >= 0 ? parsed : null;
}

export function parseChefDashboardEarning(
  value: unknown,
): ChefDashboardEarning | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const id = boundedString(raw.id, 64);
  const orderId = boundedString(raw.orderId, 64);
  const orderSource = boundedString(raw.orderSource, 30) as
    | ChefEarningOrderSource
    | null;
  const currency = boundedString(raw.currency, 3);
  const allocationReference = boundedString(raw.allocationReference, 160);
  const status = boundedString(raw.status, 40) as ChefEarningStatus | null;
  const reason = boundedString(raw.reason, 1_000);
  const grossAmount = money(raw.grossAmount);
  const commissionAmount = money(raw.commissionAmount);
  const taxWithheldAmount = money(raw.taxWithheldAmount);
  const adjustmentAmount = money(raw.adjustmentAmount, true);
  const netPayable = money(raw.netPayable);
  const createdAt = validTimestamp(raw.createdAt);
  const updatedAt = validTimestamp(raw.updatedAt);
  const approvedAt = validTimestamp(raw.approvedAt, true);
  const reversedAt = validTimestamp(raw.reversedAt, true);

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !orderId ||
    !UUID_PATTERN.test(orderId) ||
    !orderSource ||
    !EARNING_SOURCES.has(orderSource) ||
    !currency ||
    !allocationReference ||
    !status ||
    !EARNING_STATUSES.has(status) ||
    !reason ||
    grossAmount === null ||
    commissionAmount === null ||
    taxWithheldAmount === null ||
    adjustmentAmount === null ||
    netPayable === null ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const expectedNetPayable =
    Math.round(
      (grossAmount - commissionAmount - taxWithheldAmount + adjustmentAmount) *
        100,
    ) / 100;
  if (Math.abs(expectedNetPayable - netPayable) > 0.001) {
    return null;
  }

  return {
    id,
    orderId,
    orderSource,
    currency: currency.toUpperCase(),
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

export function parseChefDashboardEarnings(
  value: unknown,
): ChefDashboardEarning[] | null {
  if (!Array.isArray(value) || value.length > 500) {
    return null;
  }
  const entries = value.map(parseChefDashboardEarning);
  return entries.some(entry => entry === null)
    ? null
    : (entries as ChefDashboardEarning[]);
}

export const parseChefDashboardMenuItem = parseChefMenuItem;
export const parseChefDashboardMenuItems = parseChefMenuItems;

export const chefDashboardApi = {
  async listEarnings(_signal?: AbortSignal): Promise<ChefDashboardEarning[]> {
    throw new ChefDashboardContractUnavailableError();
  },

  listMenuItems(signal?: AbortSignal): Promise<ChefDashboardMenuItem[]> {
    return chefMenuApi.listItems(signal);
  },
};
