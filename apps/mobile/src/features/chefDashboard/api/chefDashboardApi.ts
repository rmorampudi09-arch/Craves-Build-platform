import {httpClient} from '../../../core/http/httpClient';

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

export type ChefDashboardMenuItemStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';
export type ChefDashboardFoodType = 'VEG' | 'NON_VEG' | 'EGG';
export type ChefDashboardSpiceLevel = 'MILD' | 'MEDIUM' | 'SPICY';

export interface ChefDashboardMenuImage {
  id: string;
  publicUrl: string | null;
  sortOrder: number;
  primary: boolean;
  contentType: string;
  fileSizeBytes: number;
}

export interface ChefDashboardMenuItem {
  id: string;
  itemName: string;
  description: string | null;
  category: string;
  foodType: ChefDashboardFoodType;
  price: number;
  currency: string;
  servesCount: number | null;
  preparationTimeMinutes: number | null;
  spiceLevel: ChefDashboardSpiceLevel | null;
  unitPackageWeightGrams: number;
  thermoboxRequired: boolean;
  available: boolean;
  status: ChefDashboardMenuItemStatus;
  images: ChefDashboardMenuImage[];
  createdAt: string;
  updatedAt: string;
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
const MENU_STATUSES = new Set<ChefDashboardMenuItemStatus>([
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
]);
const FOOD_TYPES = new Set<ChefDashboardFoodType>(['VEG', 'NON_VEG', 'EGG']);
const SPICE_LEVELS = new Set<ChefDashboardSpiceLevel>([
  'MILD',
  'MEDIUM',
  'SPICY',
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

function optionalString(value: unknown, maxLength: number): string | null {
  return value == null || value === '' ? null : boundedString(value, maxLength);
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

function positiveInteger(value: unknown, optional = false): number | null {
  if (optional && (value == null || value === '')) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100_000
    ? parsed
    : null;
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

function parseMenuImage(value: unknown): ChefDashboardMenuImage | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }
  const id = boundedString(raw.id, 64);
  const publicUrl = optionalString(raw.publicUrl, 2_000);
  const contentType = boundedString(raw.contentType, 100);
  const fileSizeBytes =
    typeof raw.fileSizeBytes === 'number' && Number.isSafeInteger(raw.fileSizeBytes)
      ? raw.fileSizeBytes
      : -1;
  const sortOrder =
    typeof raw.sortOrder === 'number' && Number.isInteger(raw.sortOrder)
      ? raw.sortOrder
      : -1;
  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !contentType ||
    fileSizeBytes < 0 ||
    fileSizeBytes > 20_000_000 ||
    sortOrder < 0 ||
    (publicUrl !== null && !publicUrl.startsWith('https://'))
  ) {
    return null;
  }
  return {
    id,
    publicUrl,
    sortOrder,
    primary: raw.primary === true,
    contentType,
    fileSizeBytes,
  };
}

export function parseChefDashboardMenuItem(
  value: unknown,
): ChefDashboardMenuItem | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }
  const id = boundedString(raw.id, 64);
  const itemName = boundedString(raw.itemName, 180);
  const category = boundedString(raw.category, 80);
  const foodType = boundedString(raw.foodType, 40) as ChefDashboardFoodType | null;
  const status = boundedString(raw.status, 40) as
    | ChefDashboardMenuItemStatus
    | null;
  const price = money(raw.price);
  const currency = boundedString(raw.currency, 3);
  const unitPackageWeightGrams = positiveInteger(raw.unitPackageWeightGrams);
  const createdAt = validTimestamp(raw.createdAt);
  const updatedAt = validTimestamp(raw.updatedAt);
  const rawImages = Array.isArray(raw.images) ? raw.images.slice(0, 20) : [];
  const images = rawImages.map(parseMenuImage);
  const spiceLevel = optionalString(raw.spiceLevel, 40) as
    | ChefDashboardSpiceLevel
    | null;

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !itemName ||
    !category ||
    !foodType ||
    !FOOD_TYPES.has(foodType) ||
    !status ||
    !MENU_STATUSES.has(status) ||
    price === null ||
    price < 0.01 ||
    !currency ||
    unitPackageWeightGrams === null ||
    !createdAt ||
    !updatedAt ||
    images.some(image => image === null) ||
    (spiceLevel !== null && !SPICE_LEVELS.has(spiceLevel))
  ) {
    return null;
  }

  return {
    id,
    itemName,
    description: optionalString(raw.description, 2_000),
    category,
    foodType,
    price,
    currency: currency.toUpperCase(),
    servesCount: positiveInteger(raw.servesCount, true),
    preparationTimeMinutes: positiveInteger(raw.preparationTimeMinutes, true),
    spiceLevel,
    unitPackageWeightGrams,
    thermoboxRequired: raw.thermoboxRequired === true,
    available: raw.available === true,
    status,
    images: images as ChefDashboardMenuImage[],
    createdAt,
    updatedAt,
  };
}

export function parseChefDashboardMenuItems(
  value: unknown,
): ChefDashboardMenuItem[] | null {
  if (!Array.isArray(value) || value.length > 500) {
    return null;
  }
  const items = value.map(parseChefDashboardMenuItem);
  return items.some(item => item === null)
    ? null
    : (items as ChefDashboardMenuItem[]);
}

export const chefDashboardApi = {
  async listEarnings(signal?: AbortSignal): Promise<ChefDashboardEarning[]> {
    const response = await httpClient.get<unknown>('/api/v1/chef/earnings', {
      params: {limit: 200},
      signal,
      dedupeKey: 'chef-dashboard:earnings:200',
    });
    const parsed = parseChefDashboardEarnings(response);
    if (!parsed) {
      throw new Error('Chef earnings returned an unsupported response.');
    }
    return parsed;
  },

  async listMenuItems(signal?: AbortSignal): Promise<ChefDashboardMenuItem[]> {
    const response = await httpClient.get<unknown>(
      '/api/v1/kitchens/me/menu-items',
      {
        signal,
        dedupeKey: 'chef-dashboard:menu-items',
      },
    );
    const parsed = parseChefDashboardMenuItems(response);
    if (!parsed) {
      throw new Error('Chef menu returned an unsupported response.');
    }
    return parsed;
  },
};
