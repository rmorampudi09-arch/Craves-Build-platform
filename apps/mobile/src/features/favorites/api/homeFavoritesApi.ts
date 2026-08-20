import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const HOME_FAVORITES_PAGE_SIZE = 50;
export const HOME_FAVORITES_MAX_PAGE_SIZE = 100;

export const favoriteEntityTypeSchema = z.enum(['MENU_ITEM', 'CHEF', 'KITCHEN']);
export const favoriteWatchChannelSchema = z.enum(['IN_APP', 'PUSH']);

const instantSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)));

const favoriteChefSchema = z.object({
  chefIdentityId: z.string().uuid(),
  createdAt: instantSchema,
});

const favoriteKitchenSchema = z.object({
  kitchenId: z.string().uuid(),
  createdAt: instantSchema,
});

const cursorPage = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item).max(HOME_FAVORITES_MAX_PAGE_SIZE),
    nextCursor: z.string().min(1).nullable(),
  });

const favoriteWatchSchema = z.object({
  entityType: favoriteEntityTypeSchema,
  entityId: z.string().uuid(),
  channel: favoriteWatchChannelSchema,
  enabled: z.boolean(),
  lastNotifiedAt: instantSchema.nullable(),
  lastNotificationWindowKey: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type FavoriteEntityType = z.infer<typeof favoriteEntityTypeSchema>;
export type FavoriteWatchChannel = z.infer<typeof favoriteWatchChannelSchema>;
export type FavoriteChef = z.infer<typeof favoriteChefSchema>;
export type FavoriteKitchen = z.infer<typeof favoriteKitchenSchema>;
export type FavoriteWatch = z.infer<typeof favoriteWatchSchema>;

export interface FavoriteChefPage {
  items: FavoriteChef[];
  nextCursor: string | null;
}

export interface FavoriteKitchenPage {
  items: FavoriteKitchen[];
  nextCursor: string | null;
}

function requireUuid(label: string, value: string): string {
  const parsed = z.string().uuid().safeParse(value.trim());
  if (!parsed.success) throw new Error(`${label} must be a valid UUID.`);
  return parsed.data;
}

function encodeCursor(cursor?: string | null): string {
  return cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
}

export const homeFavoritesApi = {
  async listChefs(cursor?: string | null, signal?: AbortSignal): Promise<FavoriteChefPage> {
    const response = await httpClient.get<unknown>(
      `/api/v1/customer/favorite-chefs?limit=${HOME_FAVORITES_PAGE_SIZE}${encodeCursor(cursor)}`,
      {signal, dedupeKey: `favorite-chefs:${cursor ?? 'first'}`},
    );
    const parsed = cursorPage(favoriteChefSchema).safeParse(response);
    if (!parsed.success) throw new Error('Favorite home chefs returned an unsupported response.');
    return parsed.data;
  },

  async saveChef(chefIdentityId: string): Promise<FavoriteChef> {
    const id = requireUuid('Chef identity ID', chefIdentityId);
    const response = await httpClient.put<unknown>(
      `/api/v1/customer/favorite-chefs/${encodeURIComponent(id)}`,
    );
    const parsed = favoriteChefSchema.safeParse(response);
    if (!parsed.success) throw new Error('Favorite home chef could not be verified.');
    return parsed.data;
  },

  async removeChef(chefIdentityId: string): Promise<void> {
    const id = requireUuid('Chef identity ID', chefIdentityId);
    await httpClient.delete<void>(`/api/v1/customer/favorite-chefs/${encodeURIComponent(id)}`);
  },

  async listKitchens(cursor?: string | null, signal?: AbortSignal): Promise<FavoriteKitchenPage> {
    const response = await httpClient.get<unknown>(
      `/api/v1/customer/favorite-kitchens?limit=${HOME_FAVORITES_PAGE_SIZE}${encodeCursor(cursor)}`,
      {signal, dedupeKey: `favorite-kitchens:${cursor ?? 'first'}`},
    );
    const parsed = cursorPage(favoriteKitchenSchema).safeParse(response);
    if (!parsed.success) throw new Error('Favorite kitchens returned an unsupported response.');
    return parsed.data;
  },

  async saveKitchen(kitchenId: string): Promise<FavoriteKitchen> {
    const id = requireUuid('Kitchen ID', kitchenId);
    const response = await httpClient.put<unknown>(
      `/api/v1/customer/favorite-kitchens/${encodeURIComponent(id)}`,
    );
    const parsed = favoriteKitchenSchema.safeParse(response);
    if (!parsed.success) throw new Error('Favorite kitchen could not be verified.');
    return parsed.data;
  },

  async removeKitchen(kitchenId: string): Promise<void> {
    const id = requireUuid('Kitchen ID', kitchenId);
    await httpClient.delete<void>(`/api/v1/customer/favorite-kitchens/${encodeURIComponent(id)}`);
  },

  async listWatches(entityType: FavoriteEntityType, signal?: AbortSignal): Promise<FavoriteWatch[]> {
    const response = await httpClient.get<unknown>(
      `/api/v1/customer/favorite-watches?entityType=${encodeURIComponent(entityType)}&limit=100`,
      {signal, dedupeKey: `favorite-watches:${entityType}`},
    );
    const parsed = z.array(favoriteWatchSchema).max(100).safeParse(response);
    if (!parsed.success) throw new Error('Favorite notification preferences returned an unsupported response.');
    return parsed.data;
  },

  async setWatch(
    entityType: FavoriteEntityType,
    entityId: string,
    channel: FavoriteWatchChannel,
    enabled: boolean,
  ): Promise<FavoriteWatch> {
    const id = requireUuid('Watch entity ID', entityId);
    const response = await httpClient.put<unknown>(
      `/api/v1/customer/favorite-watches/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}`,
      {channel, enabled},
    );
    const parsed = favoriteWatchSchema.safeParse(response);
    if (!parsed.success) throw new Error('Favorite notification preference could not be verified.');
    return parsed.data;
  },
};
