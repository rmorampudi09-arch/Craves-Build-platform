import {httpClient} from '../../../core/http/httpClient';

export const CART_MAX_DELIVERY_RADIUS_METERS = 10_000;

export interface CartDiscoveryDish {
  menuItemId: string;
  kitchenId: string;
  imageUrl: string | null;
  foodType: 'VEG' | 'NON_VEG' | 'EGG' | null;
  servesCount: number | null;
  spiceLevel: 'MILD' | 'MEDIUM' | 'SPICY' | null;
  preparationTimeMinutes: number | null;
  distanceMeters: number | null;
}

export interface CartServiceabilityResult {
  serviceable: boolean;
  missingKitchenIds: string[];
  dishes: CartDiscoveryDish[];
  estimatedMinutes: number | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function parseDish(value: unknown): CartDiscoveryDish | null {
  const raw = record(value);
  if (!raw || typeof raw.id !== 'string' || typeof raw.kitchenId !== 'string') return null;
  const image =
    typeof raw.primaryImageUrl === 'string' && /^https:\/\//i.test(raw.primaryImageUrl)
      ? raw.primaryImageUrl
      : null;
  const foodType =
    raw.foodType === 'VEG' || raw.foodType === 'NON_VEG' || raw.foodType === 'EGG'
      ? raw.foodType
      : null;
  const spiceLevel =
    raw.spiceLevel === 'MILD' || raw.spiceLevel === 'MEDIUM' || raw.spiceLevel === 'SPICY'
      ? raw.spiceLevel
      : null;
  return {
    menuItemId: raw.id,
    kitchenId: raw.kitchenId,
    imageUrl: image,
    foodType,
    servesCount: positiveInt(raw.servesCount),
    spiceLevel,
    preparationTimeMinutes: positiveInt(raw.preparationTimeMinutes),
    distanceMeters: positiveInt(raw.distanceMeters),
  };
}

function parseNearbyKitchenIds(value: unknown): Set<string> {
  const raw = record(value);
  const kitchens = raw && Array.isArray(raw.kitchens) ? raw.kitchens : [];
  return new Set(
    kitchens
      .map(kitchen => record(kitchen)?.id)
      .filter((id): id is string => typeof id === 'string'),
  );
}

export async function checkCartServiceability(
  latitude: number,
  longitude: number,
  kitchenIds: string[],
): Promise<CartServiceabilityResult> {
  const query =
    `latitude=${encodeURIComponent(String(latitude))}` +
    `&longitude=${encodeURIComponent(String(longitude))}` +
    `&radiusMeters=${CART_MAX_DELIVERY_RADIUS_METERS}` +
    '&page=0&size=100';

  const [kitchenResponse, menuResponse] = await Promise.all([
    httpClient.get<unknown>(`/api/v1/discovery/kitchens?${query}`, {
      dedupeKey: `cart-serviceability-kitchens:${latitude}:${longitude}:10000`,
    }),
    httpClient.get<unknown>(`/api/v1/discovery/menu-items?${query}`, {
      dedupeKey: `cart-serviceability-menu:${latitude}:${longitude}:10000`,
    }),
  ]);

  const nearbyKitchenIds = parseNearbyKitchenIds(kitchenResponse);
  const uniqueKitchenIds = [...new Set(kitchenIds)];
  const missingKitchenIds = uniqueKitchenIds.filter(id => !nearbyKitchenIds.has(id));

  const rawMenu = record(menuResponse);
  const menuValues = rawMenu && Array.isArray(rawMenu.menuItems) ? rawMenu.menuItems : [];
  const dishes = menuValues
    .map(parseDish)
    .filter((dish): dish is CartDiscoveryDish => Boolean(dish));
  const prepTimes = dishes
    .filter(dish => uniqueKitchenIds.includes(dish.kitchenId))
    .map(dish => dish.preparationTimeMinutes)
    .filter((value): value is number => value !== null);
  const maxPrep = prepTimes.length ? Math.max(...prepTimes) : null;

  return {
    serviceable: missingKitchenIds.length === 0,
    missingKitchenIds,
    dishes,
    estimatedMinutes: maxPrep === null ? null : maxPrep + 20,
  };
}