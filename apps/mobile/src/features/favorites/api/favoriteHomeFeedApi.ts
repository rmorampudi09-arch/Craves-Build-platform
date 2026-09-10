import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const FAVORITE_HOME_RESOLVE_BATCH_SIZE = 100;

const instantSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)));
const nullableInstantSchema = instantSchema.nullable();
const nullableUuidSchema = z.string().uuid().nullable();
const nullableTextSchema = z.string().nullable();

export const favoriteCookingStateSchema = z.enum([
  'COOKING_NOW',
  'COOKING_LATER_TODAY',
  'NOT_TODAY',
  'PAUSED',
  'NOT_ACCEPTING',
  'INACTIVE',
  'MISSING',
]);

export const favoriteHomeCardSchema = z.object({
  requestedType: z.enum(['CHEF', 'KITCHEN']),
  requestedId: z.string().uuid(),
  exists: z.boolean(),
  kitchenId: nullableUuidSchema,
  chefIdentityId: nullableUuidSchema,
  kitchenName: nullableTextSchema,
  displayName: nullableTextSchema,
  kitchenStatus: nullableTextSchema,
  areaName: nullableTextSchema,
  city: nullableTextSchema,
  state: nullableTextSchema,
  activeAvailableDishCount: z.number().int().nonnegative(),
  menuPreview: z.array(
    z.object({
      menuItemId: z.string().uuid(),
      itemName: z.string(),
      category: z.string(),
      foodType: z.string(),
      price: z.number().finite().nonnegative(),
      currency: z.string(),
      imageUrl: z.string().url().nullable(),
    }),
  ).max(3),
  timezoneId: z.string().min(1),
  scheduleConfigured: z.boolean(),
  acceptingOrders: z.boolean(),
  paused: z.boolean(),
  cookingState: favoriteCookingStateSchema,
  nextAvailabilityAt: nullableInstantSchema,
  evaluatedAt: instantSchema,
});

const resolveResponseSchema = z.object({
  evaluatedAt: instantSchema,
  items: z.array(favoriteHomeCardSchema).max(FAVORITE_HOME_RESOLVE_BATCH_SIZE),
});

export type FavoriteHomeCard = z.infer<typeof favoriteHomeCardSchema>;
export type FavoriteCookingState = z.infer<typeof favoriteCookingStateSchema>;

export interface FavoriteHomeResolveInput {
  chefIdentityIds: readonly string[];
  kitchenIds: readonly string[];
}

function normalizeIds(ids: readonly string[]): string[] {
  const unique = new Set<string>();
  ids.forEach(raw => {
    const parsed = z.string().uuid().safeParse(raw.trim());
    if (!parsed.success) throw new Error('Favorite home relationship contains an invalid ID.');
    unique.add(parsed.data);
  });
  return [...unique];
}

export function chunkFavoriteHomeRelationships(input: FavoriteHomeResolveInput): FavoriteHomeResolveInput[] {
  const chefs = normalizeIds(input.chefIdentityIds);
  const kitchens = normalizeIds(input.kitchenIds);
  const tagged = [
    ...chefs.map(id => ({type: 'CHEF' as const, id})),
    ...kitchens.map(id => ({type: 'KITCHEN' as const, id})),
  ];
  const chunks: FavoriteHomeResolveInput[] = [];
  for (let offset = 0; offset < tagged.length; offset += FAVORITE_HOME_RESOLVE_BATCH_SIZE) {
    const slice = tagged.slice(offset, offset + FAVORITE_HOME_RESOLVE_BATCH_SIZE);
    chunks.push({
      chefIdentityIds: slice.filter(item => item.type === 'CHEF').map(item => item.id),
      kitchenIds: slice.filter(item => item.type === 'KITCHEN').map(item => item.id),
    });
  }
  return chunks;
}

async function resolveChunk(input: FavoriteHomeResolveInput, signal?: AbortSignal): Promise<FavoriteHomeCard[]> {
  const response = await httpClient.post<unknown>(
    '/api/v1/discovery/favorites/home/resolve',
    input,
    {signal},
  );
  const parsed = resolveResponseSchema.safeParse(response);
  if (!parsed.success) throw new Error('Favorite home feed returned an unsupported response.');
  return parsed.data.items;
}

export async function resolveFavoriteHomeFeed(
  input: FavoriteHomeResolveInput,
  signal?: AbortSignal,
): Promise<FavoriteHomeCard[]> {
  const chefs = normalizeIds(input.chefIdentityIds);
  const kitchens = normalizeIds(input.kitchenIds);
  const chunks = chunkFavoriteHomeRelationships({chefIdentityIds: chefs, kitchenIds: kitchens});
  if (!chunks.length) return [];
  const responses = (await Promise.all(chunks.map(chunk => resolveChunk(chunk, signal)))).flat();
  const byKey = new Map(responses.map(item => [`${item.requestedType}:${item.requestedId}`, item]));
  const expected = [
    ...chefs.map(id => `CHEF:${id}`),
    ...kitchens.map(id => `KITCHEN:${id}`),
  ];
  return expected.map(key => {
    const item = byKey.get(key);
    if (!item) throw new Error('Favorite home feed was incomplete.');
    return item;
  });
}

export const favoriteHomeFeedApi = {resolve: resolveFavoriteHomeFeed};
