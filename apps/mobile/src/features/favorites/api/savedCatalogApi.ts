import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const SAVED_CATALOG_BATCH_SIZE = 100;
export const SAVED_CATALOG_MAX_ITEMS = 200;

const availabilityStateSchema = z.enum([
  'AVAILABLE_NOW',
  'COOKING_LATER_TODAY',
  'NOT_TODAY',
  'PAUSED',
  'KITCHEN_NOT_ACCEPTING',
  'ITEM_UNAVAILABLE',
  'RETIRED',
  'KITCHEN_INACTIVE',
  'MISSING',
]);

const nullableUuid = z.string().uuid().nullable();
const nullableText = z.string().nullable();
const nullableInstant = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)))
  .nullable();

export const savedCatalogItemSchema = z.object({
  menuItemId: z.string().uuid(),
  found: z.boolean(),
  availabilityState: availabilityStateSchema,
  evaluatedAt: z.string().refine(value => !Number.isNaN(Date.parse(value))),
  itemName: nullableText,
  description: nullableText,
  category: nullableText,
  foodType: nullableText,
  price: z.number().finite().nonnegative().nullable(),
  currency: nullableText,
  itemStatus: nullableText,
  itemAvailable: z.boolean(),
  kitchenId: nullableUuid,
  kitchenName: nullableText,
  kitchenDisplayName: nullableText,
  kitchenStatus: nullableText,
  areaName: nullableText,
  city: nullableText,
  state: nullableText,
  primaryImageUrl: z.string().url().nullable(),
  timezoneId: z.string().min(1),
  scheduleConfigured: z.boolean(),
  acceptingOrders: z.boolean(),
  paused: z.boolean(),
  availableNow: z.boolean(),
  nextAvailabilityAt: nullableInstant,
});

const resolveResponseSchema = z.object({
  evaluatedAt: z.string().refine(value => !Number.isNaN(Date.parse(value))),
  items: z.array(savedCatalogItemSchema).max(SAVED_CATALOG_BATCH_SIZE),
});

export type SavedCatalogAvailabilityState = z.infer<
  typeof availabilityStateSchema
>;
export type SavedCatalogItem = z.infer<typeof savedCatalogItemSchema>;

function normalizeMenuItemIds(menuItemIds: readonly string[]): string[] {
  if (menuItemIds.length > SAVED_CATALOG_MAX_ITEMS) {
    throw new Error(
      `Saved can resolve at most ${SAVED_CATALOG_MAX_ITEMS} dishes at once.`,
    );
  }

  const unique = new Set<string>();
  for (const rawId of menuItemIds) {
    const parsed = z.string().uuid().safeParse(rawId.trim());
    if (!parsed.success) {
      throw new Error('Saved contains an invalid dish ID.');
    }
    unique.add(parsed.data);
  }
  return [...unique];
}

export function chunkSavedMenuItemIds(
  menuItemIds: readonly string[],
): string[][] {
  const normalized = normalizeMenuItemIds(menuItemIds);
  const chunks: string[][] = [];
  for (let offset = 0; offset < normalized.length; offset += SAVED_CATALOG_BATCH_SIZE) {
    chunks.push(normalized.slice(offset, offset + SAVED_CATALOG_BATCH_SIZE));
  }
  return chunks;
}

async function resolveChunk(
  menuItemIds: readonly string[],
  signal?: AbortSignal,
): Promise<SavedCatalogItem[]> {
  const response = await httpClient.post<unknown>(
    '/api/v1/discovery/saved/menu-items/resolve',
    {menuItemIds},
    {signal},
  );
  const parsed = resolveResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new Error('Saved dish details returned an unsupported response.');
  }
  return parsed.data.items;
}

export async function resolveSavedCatalogItems(
  menuItemIds: readonly string[],
  signal?: AbortSignal,
): Promise<SavedCatalogItem[]> {
  const chunks = chunkSavedMenuItemIds(menuItemIds);
  if (chunks.length === 0) return [];

  const resolvedChunks = await Promise.all(
    chunks.map(chunk => resolveChunk(chunk, signal)),
  );
  const byId = new Map<string, SavedCatalogItem>();
  resolvedChunks.flat().forEach(item => byId.set(item.menuItemId, item));

  const normalized = normalizeMenuItemIds(menuItemIds);
  return normalized.map(menuItemId => {
    const item = byId.get(menuItemId);
    if (!item) {
      throw new Error('Saved dish details were incomplete.');
    }
    return item;
  });
}

export const savedCatalogApi = {
  resolve: resolveSavedCatalogItems,
};
