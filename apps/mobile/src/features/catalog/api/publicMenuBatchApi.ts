import {httpClient} from '../../../core/http/httpClient';

export const PUBLIC_MENU_BATCH_RESOLVE_AVAILABLE = false;
export const PUBLIC_MENU_BATCH_RESOLVE_PATH =
  '/api/v1/catalog/menu-items/resolve';
export const PUBLIC_MENU_BATCH_SIZE = 100;
export const PUBLIC_MENU_BATCH_VISIBLE_LIMIT = 600;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ITEM_KEYS = new Set([
  'id',
  'kitchenId',
  'itemName',
  'price',
  'currency',
  'unitPackageWeightGrams',
  'thermoboxRequired',
]);

export interface PublicResolvedMenuItem {
  id: string;
  kitchenId: string;
  itemName: string;
  price: number;
  currency: string;
  unitPackageWeightGrams: number | null;
  thermoboxRequired: boolean | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function normalizeIds(menuItemIds: readonly string[]): string[] {
  if (menuItemIds.length > PUBLIC_MENU_BATCH_VISIBLE_LIMIT) {
    throw new Error('PUBLIC_MENU_BATCH_VISIBLE_LIMIT_EXCEEDED');
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of menuItemIds) {
    const id = raw.trim();
    if (!UUID_PATTERN.test(id)) {
      throw new Error('PUBLIC_MENU_BATCH_ID_INVALID');
    }
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }
  return unique;
}

export function chunkPublicMenuItemIds(
  menuItemIds: readonly string[],
): string[][] {
  const normalized = normalizeIds(menuItemIds);
  const chunks: string[][] = [];
  for (
    let offset = 0;
    offset < normalized.length;
    offset += PUBLIC_MENU_BATCH_SIZE
  ) {
    chunks.push(normalized.slice(offset, offset + PUBLIC_MENU_BATCH_SIZE));
  }
  return chunks;
}

export function parsePublicResolvedMenuItems(
  value: unknown,
  requestedIds: readonly string[],
): PublicResolvedMenuItem[] | null {
  if (!Array.isArray(value) || value.length > requestedIds.length) {
    return null;
  }
  const requested = new Set(requestedIds);
  const seen = new Set<string>();
  const items: PublicResolvedMenuItem[] = [];

  for (const rawValue of value) {
    const raw = asRecord(rawValue);
    if (!raw || !exactKeys(raw, ITEM_KEYS)) return null;

    const id =
      typeof raw.id === 'string' && UUID_PATTERN.test(raw.id) ? raw.id : null;
    const kitchenId =
      typeof raw.kitchenId === 'string' && UUID_PATTERN.test(raw.kitchenId)
        ? raw.kitchenId
        : null;
    const itemName =
      typeof raw.itemName === 'string' &&
      raw.itemName.trim().length > 0 &&
      raw.itemName.trim().length <= 240
        ? raw.itemName.trim()
        : null;
    const price =
      typeof raw.price === 'number' &&
      Number.isFinite(raw.price) &&
      raw.price >= 0
        ? raw.price
        : null;
    const currency =
      typeof raw.currency === 'string' && CURRENCY_PATTERN.test(raw.currency)
        ? raw.currency
        : null;
    const unitPackageWeightGrams =
      raw.unitPackageWeightGrams == null
        ? null
        : typeof raw.unitPackageWeightGrams === 'number' &&
            Number.isSafeInteger(raw.unitPackageWeightGrams) &&
            raw.unitPackageWeightGrams > 0
          ? raw.unitPackageWeightGrams
          : undefined;
    const thermoboxRequired =
      raw.thermoboxRequired == null
        ? null
        : typeof raw.thermoboxRequired === 'boolean'
          ? raw.thermoboxRequired
          : undefined;

    if (
      !id ||
      !requested.has(id) ||
      seen.has(id) ||
      !kitchenId ||
      !itemName ||
      price === null ||
      !currency ||
      unitPackageWeightGrams === undefined ||
      thermoboxRequired === undefined
    ) {
      return null;
    }

    seen.add(id);
    items.push({
      id,
      kitchenId,
      itemName,
      price,
      currency,
      unitPackageWeightGrams,
      thermoboxRequired,
    });
  }

  return items;
}

async function resolveChunk(
  menuItemIds: readonly string[],
  signal?: AbortSignal,
): Promise<PublicResolvedMenuItem[]> {
  const response = await httpClient.post<unknown>(
    PUBLIC_MENU_BATCH_RESOLVE_PATH,
    {menuItemIds},
    {signal},
  );
  const parsed = parsePublicResolvedMenuItems(response, menuItemIds);
  if (!parsed) {
    throw new Error('PUBLIC_MENU_BATCH_INVALID_RESPONSE');
  }
  return parsed;
}

export async function resolvePublicMenuItems(
  menuItemIds: readonly string[],
  signal?: AbortSignal,
): Promise<PublicResolvedMenuItem[]> {
  const chunks = chunkPublicMenuItemIds(menuItemIds);
  if (chunks.length === 0) return [];

  const results = await Promise.all(
    chunks.map(chunk => resolveChunk(chunk, signal)),
  );
  const all = results.flat();
  const byId = new Map(all.map(item => [item.id, item] as const));

  return normalizeIds(menuItemIds)
    .map(id => byId.get(id))
    .filter((item): item is PublicResolvedMenuItem => Boolean(item));
}
