import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const PUBLIC_MENU_ITEM_DETAIL_PATH = '/api/v1/catalog/menu-items';
export const PUBLIC_KITCHEN_DETAIL_PATH = '/api/v1/catalog/kitchens';

const menuItemIdSchema = z.string().uuid();
const foodTypeSchema = z.enum(['VEG', 'NON_VEG', 'EGG']);
const spiceLevelSchema = z.enum(['MILD', 'MEDIUM', 'SPICY']);
const menuItemStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']);
const kitchenStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'SUSPENDED']);

const menuItemImageSchema = z.object({
  id: z.string().uuid(),
  menuItemId: z.string().uuid(),
  publicUrl: z.string().nullable(),
  sortOrder: z.number().int(),
  primary: z.boolean(),
});

const publicMenuItemSchema = z.object({
  id: z.string().uuid(),
  kitchenId: z.string().uuid(),
  itemName: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().min(1),
  foodType: foodTypeSchema,
  price: z.number().finite().positive(),
  currency: z.string().min(1),
  servesCount: z.number().int().positive().nullable(),
  preparationTimeMinutes: z.number().int().positive().nullable(),
  spiceLevel: spiceLevelSchema.nullable(),
  unitPackageWeightGrams: z.number().int().positive().nullable(),
  thermoboxRequired: z.boolean().nullable(),
  available: z.boolean(),
  status: menuItemStatusSchema,
  images: z.array(menuItemImageSchema),
});

const publicKitchenSchema = z.object({
  id: z.string().uuid(),
  kitchenName: z.string().min(1),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  areaName: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  status: kitchenStatusSchema,
});

type PublicMenuItem = z.infer<typeof publicMenuItemSchema>;
type PublicKitchen = z.infer<typeof publicKitchenSchema>;

export type CustomerDishFoodType = z.infer<typeof foodTypeSchema>;
export type CustomerDishSpiceLevel = z.infer<typeof spiceLevelSchema>;

export interface CustomerDishDetailImage {
  id: string;
  url: string;
  primary: boolean;
  sortOrder: number;
}

export interface CustomerDishKitchenSummary {
  id: string;
  kitchenName: string;
  displayName: string | null;
  description: string | null;
  areaName: string | null;
  city: string | null;
  state: string | null;
}

export interface CustomerDishDetail {
  id: string;
  kitchen: CustomerDishKitchenSummary;
  itemName: string;
  description: string | null;
  category: string;
  cuisine: null;
  foodType: CustomerDishFoodType;
  price: {
    amount: number;
    currency: string;
  };
  servesCount: number | null;
  preparationTimeMinutes: number | null;
  spiceLevel: CustomerDishSpiceLevel | null;
  unitPackageWeightGrams: number | null;
  thermoboxRequired: boolean | null;
  availability: {
    available: true;
    status: 'ACTIVE';
  };
  images: readonly CustomerDishDetailImage[];
  ingredients: null;
  allergens: null;
  reviewSummary: {
    aggregateRating: null;
    reviewCount: null;
  };
  favoriteState: null;
  contractGaps: typeof CUSTOMER_DISH_DETAIL_CONTRACT_GAPS;
}

export const CUSTOMER_DISH_DETAIL_CONTRACT_GAPS = [
  {
    capability: 'CUISINE',
    reason:
      'The current public catalog menu-item contract exposes category and foodType but no cuisine identity or cuisine value.',
  },
  {
    capability: 'INGREDIENTS',
    reason:
      'The current public catalog menu-item contract does not expose ingredients.',
  },
  {
    capability: 'ALLERGENS',
    reason:
      'The current public catalog menu-item contract does not expose allergen metadata.',
  },
  {
    capability: 'REVIEWS',
    reason:
      'The current branch has no authoritative customer dish review or aggregate-rating contract.',
  },
] as const;

function normalizeMenuItemId(value: string): string {
  const result = menuItemIdSchema.safeParse(value.trim());
  if (!result.success) {
    throw new Error('menuItemId must be a valid UUID.');
  }
  return result.data;
}

export function isCustomerDishMenuItemId(value: string): boolean {
  return menuItemIdSchema.safeParse(value.trim()).success;
}

function requireSellableMenuItem(value: unknown): PublicMenuItem {
  const item = publicMenuItemSchema.parse(value);
  if (!item.available || item.status !== 'ACTIVE') {
    throw new Error('This dish is no longer available.');
  }
  return item;
}

function requireActiveKitchen(value: unknown): PublicKitchen {
  const kitchen = publicKitchenSchema.parse(value);
  if (kitchen.status !== 'ACTIVE') {
    throw new Error('This kitchen is no longer available.');
  }
  return kitchen;
}

function normalizeHttpsPublicUrl(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' ? normalized : null;
  } catch {
    return null;
  }
}

function mapImages(item: PublicMenuItem): readonly CustomerDishDetailImage[] {
  const images: CustomerDishDetailImage[] = [];

  item.images.forEach(image => {
    if (image.menuItemId !== item.id) {
      throw new Error('Catalog image identity does not match the menu item.');
    }

    const url = normalizeHttpsPublicUrl(image.publicUrl);
    if (url) {
      images.push({
        id: image.id,
        url,
        primary: image.primary,
        sortOrder: image.sortOrder,
      });
    }
  });

  return images;
}

export function mapCustomerDishDetail(
  menuItemValue: unknown,
  kitchenValue: unknown,
): CustomerDishDetail {
  const item = requireSellableMenuItem(menuItemValue);
  const kitchen = requireActiveKitchen(kitchenValue);

  if (item.kitchenId !== kitchen.id) {
    throw new Error('Catalog kitchen identity does not match the menu item.');
  }

  return {
    id: item.id,
    kitchen: {
      id: kitchen.id,
      kitchenName: kitchen.kitchenName,
      displayName: kitchen.displayName,
      description: kitchen.description,
      areaName: kitchen.areaName,
      city: kitchen.city,
      state: kitchen.state,
    },
    itemName: item.itemName,
    description: item.description,
    category: item.category,
    cuisine: null,
    foodType: item.foodType,
    price: {
      amount: item.price,
      currency: item.currency,
    },
    servesCount: item.servesCount,
    preparationTimeMinutes: item.preparationTimeMinutes,
    spiceLevel: item.spiceLevel,
    unitPackageWeightGrams: item.unitPackageWeightGrams,
    thermoboxRequired: item.thermoboxRequired,
    availability: {
      available: true,
      status: 'ACTIVE',
    },
    images: mapImages(item),
    ingredients: null,
    allergens: null,
    reviewSummary: {
      aggregateRating: null,
      reviewCount: null,
    },
    favoriteState: null,
    contractGaps: CUSTOMER_DISH_DETAIL_CONTRACT_GAPS,
  };
}

export const dishDetailApi = {
  async getCustomerDishDetail(
    menuItemId: string,
    signal?: AbortSignal,
  ): Promise<CustomerDishDetail> {
    const normalizedId = normalizeMenuItemId(menuItemId);
    const menuItemValue = await httpClient.get<unknown>(
      `${PUBLIC_MENU_ITEM_DETAIL_PATH}/${encodeURIComponent(normalizedId)}`,
      {
        signal,
        dedupeKey: `customer-dish-detail-item:${normalizedId}`,
      },
    );
    const menuItem = requireSellableMenuItem(menuItemValue);

    if (menuItem.id !== normalizedId) {
      throw new Error('Catalog menu-item identity does not match the request.');
    }

    const kitchenValue = await httpClient.get<unknown>(
      `${PUBLIC_KITCHEN_DETAIL_PATH}/${encodeURIComponent(menuItem.kitchenId)}`,
      {
        signal,
        dedupeKey: `customer-dish-detail-kitchen:${menuItem.kitchenId}`,
      },
    );

    return mapCustomerDishDetail(menuItem, kitchenValue);
  },
};
