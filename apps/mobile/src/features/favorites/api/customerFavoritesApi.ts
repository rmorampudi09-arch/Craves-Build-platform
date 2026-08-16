import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

const favoriteSchema = z.object({
  menuItemId: z.string().uuid(),
  createdAt: z.string().refine(value => !Number.isNaN(Date.parse(value))),
});

export type CustomerFavorite = z.infer<typeof favoriteSchema>;

function requireMenuItemId(value: string): string {
  const parsed = z.string().uuid().safeParse(value.trim());
  if (!parsed.success) {
    throw new Error('Favorite dish ID must be a valid UUID.');
  }
  return parsed.data;
}

export const customerFavoritesApi = {
  async list(signal?: AbortSignal): Promise<CustomerFavorite[]> {
    const response = await httpClient.get<unknown>('/api/v1/customer/favorites', {
      signal,
      dedupeKey: 'customer-favorites:list',
    });
    const parsed = z.array(favoriteSchema).max(200).safeParse(response);
    if (!parsed.success) {
      throw new Error('Favorites returned an unsupported response.');
    }
    return parsed.data;
  },

  async save(menuItemId: string): Promise<CustomerFavorite> {
    const id = requireMenuItemId(menuItemId);
    const response = await httpClient.put<unknown>(
      `/api/v1/customer/favorites/${encodeURIComponent(id)}`,
    );
    const parsed = favoriteSchema.safeParse(response);
    if (!parsed.success) {
      throw new Error('Saved favorite could not be verified.');
    }
    return parsed.data;
  },

  async remove(menuItemId: string): Promise<void> {
    const id = requireMenuItemId(menuItemId);
    await httpClient.delete<void>(
      `/api/v1/customer/favorites/${encodeURIComponent(id)}`,
    );
  },
};
