import {z} from 'zod';
import {httpClient} from '../../core/http/httpClient';

const CATALOG_MENU_ITEMS_PATH = '/api/v1/catalog/menu-items';
const CATALOG_KITCHENS_PATH = '/api/v1/catalog/kitchens';
const uuidSchema = z.string().uuid();

const menuItemImageSchema = z.object({
  publicUrl: z.string().nullable(),
  sortOrder: z.number().int(),
  primary: z.boolean(),
});

const menuItemPresentationSchema = z.object({
  id: z.string().uuid(),
  images: z.array(menuItemImageSchema),
});

const kitchenPresentationSchema = z.object({
  id: z.string().uuid(),
  kitchenName: z.string().min(1),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
});

export interface CustomerCatalogKitchenPresentation {
  id: string;
  kitchenName: string;
  displayName: string | null;
  description: string | null;
}

function normalizeId(value: string): string {
  return uuidSchema.parse(value.trim());
}

function normalizeHttpsUrl(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    return new URL(normalized).protocol === 'https:' ? normalized : null;
  } catch {
    return null;
  }
}

export const customerCatalogPresentationApi = {
  async getKitchen(
    kitchenId: string,
    signal?: AbortSignal,
  ): Promise<CustomerCatalogKitchenPresentation> {
    const id = normalizeId(kitchenId);
    const response = await httpClient.get<unknown>(
      `${CATALOG_KITCHENS_PATH}/${encodeURIComponent(id)}`,
      {signal, dedupeKey: `customer-catalog-kitchen:${id}`},
    );
    const kitchen = kitchenPresentationSchema.parse(response);
    if (kitchen.id !== id) {
      throw new Error('Catalog kitchen identity does not match the request.');
    }
    return kitchen;
  },

  async getMenuItemPrimaryImageUrl(
    menuItemId: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const id = normalizeId(menuItemId);
    const response = await httpClient.get<unknown>(
      `${CATALOG_MENU_ITEMS_PATH}/${encodeURIComponent(id)}`,
      {signal, dedupeKey: `customer-catalog-menu-image:${id}`},
    );
    const item = menuItemPresentationSchema.parse(response);
    if (item.id !== id) {
      throw new Error('Catalog menu-item identity does not match the request.');
    }

    return [...item.images]
      .sort((left, right) => {
        if (left.primary !== right.primary) return left.primary ? -1 : 1;
        return left.sortOrder - right.sortOrder;
      })
      .map(image => normalizeHttpsUrl(image.publicUrl))
      .find((url): url is string => Boolean(url)) ?? null;
  },
};
