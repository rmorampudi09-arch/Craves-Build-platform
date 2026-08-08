import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const HOME_NEARBY_MENU_ITEMS_PATH = '/api/v1/discovery/menu-items';
export const DISCOVERY_MAX_RADIUS_METERS = 50_000;
export const DISCOVERY_MAX_PAGE_SIZE = 100;

const pageMetadataSchema = z.object({
  page: z.number().int().min(0),
  size: z.number().int().min(1).max(DISCOVERY_MAX_PAGE_SIZE),
  totalElements: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
});

const nearbyDishSchema = z.object({
  id: z.string().uuid(),
  kitchenId: z.string().uuid(),
  kitchenName: z.string().min(1),
  kitchenDisplayName: z.string().nullable(),
  areaName: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  kitchenLatitude: z.number().min(-90).max(90),
  kitchenLongitude: z.number().min(-180).max(180),
  distanceMeters: z.number().int().min(0),
  itemName: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().min(1),
  foodType: z.enum(['VEG', 'NON_VEG', 'EGG']),
  price: z.number().positive(),
  currency: z.string().min(1),
  servesCount: z.number().int().positive().nullable(),
  preparationTimeMinutes: z.number().int().positive().nullable(),
  spiceLevel: z.enum(['MILD', 'MEDIUM', 'SPICY']).nullable(),
  unitPackageWeightGrams: z.number().int().positive().nullable(),
  thermoboxRequired: z.boolean().nullable(),
  primaryImageUrl: z.string().nullable(),
});

const nearbyDishPageSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(1).max(DISCOVERY_MAX_RADIUS_METERS),
  page: pageMetadataSchema,
  menuItems: z.array(nearbyDishSchema),
});

export type NearbyDish = z.infer<typeof nearbyDishSchema>;
export type NearbyDishPage = z.infer<typeof nearbyDishPageSchema>;

export interface NearbyDishPageRequest {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  page: number;
  size: number;
}

function requireFiniteRange(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireIntegerRange(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function normalizeNearbyDishPageRequest(
  request: NearbyDishPageRequest,
): NearbyDishPageRequest {
  return {
    latitude: requireFiniteRange('latitude', request.latitude, -90, 90),
    longitude: requireFiniteRange('longitude', request.longitude, -180, 180),
    radiusMeters: requireIntegerRange(
      'radiusMeters',
      request.radiusMeters,
      1,
      DISCOVERY_MAX_RADIUS_METERS,
    ),
    page: requireIntegerRange('page', request.page, 0, Number.MAX_SAFE_INTEGER),
    size: requireIntegerRange('size', request.size, 1, DISCOVERY_MAX_PAGE_SIZE),
  };
}

function verifyResponseContext(
  response: NearbyDishPage,
  request: NearbyDishPageRequest,
): NearbyDishPage {
  if (
    response.latitude !== request.latitude ||
    response.longitude !== request.longitude ||
    response.radiusMeters !== request.radiusMeters ||
    response.page.page !== request.page ||
    response.page.size !== request.size
  ) {
    throw new Error('Discovery response context does not match the request.');
  }
  return response;
}

export const homeFeedApi = {
  async listNearbyDishes(
    request: NearbyDishPageRequest,
    signal?: AbortSignal,
  ): Promise<NearbyDishPage> {
    const normalized = normalizeNearbyDishPageRequest(request);
    const response = await httpClient.get<unknown>(HOME_NEARBY_MENU_ITEMS_PATH, {
      params: normalized,
      signal,
      dedupeKey: [
        'home-nearby-dishes',
        normalized.latitude,
        normalized.longitude,
        normalized.radiusMeters,
        normalized.page,
        normalized.size,
      ].join(':'),
    });

    const parsed = nearbyDishPageSchema.parse(response);
    return verifyResponseContext(parsed, normalized);
  },
};
