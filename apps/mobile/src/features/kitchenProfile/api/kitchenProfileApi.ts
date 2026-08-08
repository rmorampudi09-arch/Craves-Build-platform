import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const PUBLIC_KITCHEN_PROFILE_PATH = '/api/v1/catalog/kitchens';

const kitchenIdSchema = z.string().uuid();
const kitchenStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'SUSPENDED']);
const menuItemStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']);
const foodTypeSchema = z.enum(['VEG', 'NON_VEG', 'EGG']);
const spiceLevelSchema = z.enum(['MILD', 'MEDIUM', 'SPICY']);

const publicKitchenProfileSchema = z.object({
  id: z.string().uuid(),
  kitchenName: z.string().min(1),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  areaName: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  status: kitchenStatusSchema,
  createdAt: z.string().min(1).nullable(),
});

const publicMenuItemImageSchema = z.object({
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
  available: z.boolean(),
  status: menuItemStatusSchema,
  images: z.array(publicMenuItemImageSchema),
});

const publicMenuItemsSchema = z.array(publicMenuItemSchema);

type PublicKitchenProfile = z.infer<typeof publicKitchenProfileSchema>;
type PublicMenuItem = z.infer<typeof publicMenuItemSchema>;

export type CustomerKitchenFoodType = z.infer<typeof foodTypeSchema>;
export type CustomerKitchenSpiceLevel = z.infer<typeof spiceLevelSchema>;

export interface CustomerKitchenMenuImage {
  id: string;
  url: string;
  primary: boolean;
  sortOrder: number;
}

export interface CustomerKitchenMenuItemSummary {
  id: string;
  itemName: string;
  description: string | null;
  category: string;
  foodType: CustomerKitchenFoodType;
  price: {
    amount: number;
    currency: string;
  };
  servesCount: number | null;
  preparationTimeMinutes: number | null;
  spiceLevel: CustomerKitchenSpiceLevel | null;
  images: readonly CustomerKitchenMenuImage[];
}

export interface CustomerKitchenProfile {
  id: string;
  kitchenName: string;
  displayName: string | null;
  biography: string | null;
  location: {
    areaName: string | null;
    city: string | null;
    state: string | null;
  };
  joinedAt: string | null;
  menuItems: readonly CustomerKitchenMenuItemSummary[];
  verificationStatus: null;
  reviewSummary: {
    aggregateRating: null;
    reviewCount: null;
  };
  orderCount: null;
  serviceability: null;
  favoriteState: null;
  featuredMenuItems: null;
  heroMedia: null;
  contractGaps: typeof CUSTOMER_KITCHEN_PROFILE_CONTRACT_GAPS;
}

export const CUSTOMER_KITCHEN_PROFILE_CONTRACT_GAPS = [
  {
    capability: 'VERIFICATION',
    reason:
      'The current public Catalog kitchen contract does not expose a customer-facing verification badge or verification status.',
  },
  {
    capability: 'RATING_REVIEWS',
    reason:
      'The current branch has no authoritative customer-facing kitchen rating, aggregate review, or review-count contract.',
  },
  {
    capability: 'ORDER_COUNT',
    reason:
      'The current public Catalog kitchen contract does not expose a customer-facing fulfilled-order count metric.',
  },
  {
    capability: 'SERVICEABILITY',
    reason:
      'Nearby discovery radius and distance are browsing data only; the current branch has no final kitchen-to-customer delivery serviceability or ETA contract.',
  },
  {
    capability: 'FAVORITES',
    reason:
      'The current branch has no authoritative customer kitchen favorite read or mutation contract.',
  },
  {
    capability: 'FEATURED_DISHES',
    reason:
      'The public kitchen menu endpoint returns sellable dishes ordered by category and item name, but no authoritative featured/top-dish ranking.',
  },
  {
    capability: 'KITCHEN_MEDIA',
    reason:
      'The current public kitchen profile contract does not expose a kitchen hero, chef portrait, or other public kitchen media.',
  },
] as const;

function normalizeKitchenId(value: string): string {
  const result = kitchenIdSchema.safeParse(value.trim());
  if (!result.success) {
    throw new Error('kitchenId must be a valid UUID.');
  }
  return result.data;
}

export function isCustomerKitchenId(value: string): boolean {
  return kitchenIdSchema.safeParse(value.trim()).success;
}

function requireActiveKitchen(value: unknown): PublicKitchenProfile {
  const kitchen = publicKitchenProfileSchema.parse(value);
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

function mapMenuItemImages(
  item: PublicMenuItem,
): readonly CustomerKitchenMenuImage[] {
  const images: CustomerKitchenMenuImage[] = [];

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

function mapMenuItems(
  kitchenId: string,
  value: unknown,
): readonly CustomerKitchenMenuItemSummary[] {
  const items = publicMenuItemsSchema.parse(value);

  return items.map(item => {
    if (item.kitchenId !== kitchenId) {
      throw new Error('Catalog menu-item kitchen identity does not match the request.');
    }
    if (!item.available || item.status !== 'ACTIVE') {
      throw new Error('Public kitchen menu contained a non-sellable dish.');
    }

    return {
      id: item.id,
      itemName: item.itemName,
      description: item.description,
      category: item.category,
      foodType: item.foodType,
      price: {
        amount: item.price,
        currency: item.currency,
      },
      servesCount: item.servesCount,
      preparationTimeMinutes: item.preparationTimeMinutes,
      spiceLevel: item.spiceLevel,
      images: mapMenuItemImages(item),
    };
  });
}

export function mapCustomerKitchenProfile(
  kitchenValue: unknown,
  menuItemsValue: unknown,
): CustomerKitchenProfile {
  const kitchen = requireActiveKitchen(kitchenValue);
  const menuItems = mapMenuItems(kitchen.id, menuItemsValue);

  return {
    id: kitchen.id,
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName,
    biography: kitchen.description,
    location: {
      areaName: kitchen.areaName,
      city: kitchen.city,
      state: kitchen.state,
    },
    joinedAt: kitchen.createdAt,
    menuItems,
    verificationStatus: null,
    reviewSummary: {
      aggregateRating: null,
      reviewCount: null,
    },
    orderCount: null,
    serviceability: null,
    favoriteState: null,
    featuredMenuItems: null,
    heroMedia: null,
    contractGaps: CUSTOMER_KITCHEN_PROFILE_CONTRACT_GAPS,
  };
}

export const kitchenProfileApi = {
  async getCustomerKitchenProfile(
    kitchenId: string,
    signal?: AbortSignal,
  ): Promise<CustomerKitchenProfile> {
    const normalizedId = normalizeKitchenId(kitchenId);
    const encodedId = encodeURIComponent(normalizedId);

    const kitchenValue = await httpClient.get<unknown>(
      `${PUBLIC_KITCHEN_PROFILE_PATH}/${encodedId}`,
      {
        signal,
        dedupeKey: `customer-kitchen-profile:${normalizedId}`,
      },
    );
    const kitchen = requireActiveKitchen(kitchenValue);

    if (kitchen.id !== normalizedId) {
      throw new Error('Catalog kitchen identity does not match the request.');
    }

    const menuItemsValue = await httpClient.get<unknown>(
      `${PUBLIC_KITCHEN_PROFILE_PATH}/${encodedId}/menu-items`,
      {
        signal,
        dedupeKey: `customer-kitchen-profile-menu:${normalizedId}`,
      },
    );

    return mapCustomerKitchenProfile(kitchen, menuItemsValue);
  },
};
