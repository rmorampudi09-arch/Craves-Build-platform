import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const NEARBY_CHEF_DISCOVERY_PATH = '/api/v1/discovery/kitchens';
export const LEGACY_NEARBY_CHEF_DISCOVERY_PATH = '/api/v1/catalog/kitchens';
export const NEARBY_CHEF_MAX_RADIUS_METERS = 50_000;
export const NEARBY_CHEF_MAX_PAGE_SIZE = 100;

const pageMetadataSchema = z.object({
  page: z.number().int().min(0),
  size: z.number().int().min(1).max(NEARBY_CHEF_MAX_PAGE_SIZE),
  totalElements: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
});

const nearbyKitchenSchema = z.object({
  id: z.string().uuid(),
  kitchenName: z.string().min(1),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  areaName: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  distanceMeters: z.number().int().min(0),
  activeMenuItemCount: z.number().int().min(0),
});

const nearbyKitchenPageSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(1).max(NEARBY_CHEF_MAX_RADIUS_METERS),
  page: pageMetadataSchema,
  kitchens: z.array(nearbyKitchenSchema),
});

const legacyNearbyKitchenSchema = z.object({
  id: z.string().uuid(),
  kitchenName: z.string().min(1),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  areaName: z.string().nullable(),
  city: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  distanceKm: z.number().min(0).nullable(),
  activeMenuItemCount: z.number().int().min(0),
});

const legacyNearbyKitchenResponseSchema = z.object({
  kitchens: z.array(legacyNearbyKitchenSchema),
});

export type NearbyKitchen = z.infer<typeof nearbyKitchenSchema>;
export type NearbyKitchenPage = z.infer<typeof nearbyKitchenPageSchema>;

export interface NearbyKitchenPageRequest {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  page: number;
  size: number;
  query?: string | null;
  category?: string | null;
  foodType?: 'VEG' | 'NON_VEG' | 'EGG' | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  maxPreparationTimeMinutes?: number | null;
  spiceLevel?: 'MILD' | 'MEDIUM' | 'SPICY' | null;
  sort?: 'DISTANCE_ASC' | 'NAME_ASC' | null;
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

export function normalizeNearbyKitchenPageRequest(
  request: NearbyKitchenPageRequest,
): NearbyKitchenPageRequest {
  const query = request.query?.trim() || null;
  const category = request.category?.trim() || null;
  if (query && [...query].length > 120) throw new Error('query must be 120 characters or fewer.');
  if (category && [...category].length > 80) throw new Error('category must be 80 characters or fewer.');
  const minPrice = request.minPrice ?? null;
  const maxPrice = request.maxPrice ?? null;
  if (minPrice !== null && (!Number.isFinite(minPrice) || minPrice < 0)) throw new Error('minPrice must be zero or greater.');
  if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) throw new Error('maxPrice must be zero or greater.');
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new Error('minPrice must not exceed maxPrice.');
  const maxPreparationTimeMinutes = request.maxPreparationTimeMinutes ?? null;
  if (
    maxPreparationTimeMinutes !== null &&
    (!Number.isInteger(maxPreparationTimeMinutes) || maxPreparationTimeMinutes <= 0)
  ) throw new Error('maxPreparationTimeMinutes must be a positive integer.');
  return {
    latitude: requireFiniteRange('latitude', request.latitude, -90, 90),
    longitude: requireFiniteRange('longitude', request.longitude, -180, 180),
    radiusMeters: requireIntegerRange(
      'radiusMeters',
      request.radiusMeters,
      1,
      NEARBY_CHEF_MAX_RADIUS_METERS,
    ),
    page: requireIntegerRange('page', request.page, 0, Number.MAX_SAFE_INTEGER),
    size: requireIntegerRange('size', request.size, 1, NEARBY_CHEF_MAX_PAGE_SIZE),
    query,
    category,
    foodType: request.foodType ?? null,
    minPrice,
    maxPrice,
    maxPreparationTimeMinutes,
    spiceLevel: request.spiceLevel ?? null,
    sort: request.sort ?? 'DISTANCE_ASC',
  };
}

function verifyResponseContext(
  response: NearbyKitchenPage,
  request: NearbyKitchenPageRequest,
): NearbyKitchenPage {
  if (
    response.latitude !== request.latitude ||
    response.longitude !== request.longitude ||
    response.radiusMeters !== request.radiusMeters ||
    response.page.page !== request.page ||
    response.page.size !== request.size
  ) {
    throw new Error('Nearby kitchen response context does not match the request.');
  }
  return response;
}

export function mapLegacyNearbyKitchenPage(
  value: unknown,
  request: NearbyKitchenPageRequest,
): NearbyKitchenPage {
  const parsed = legacyNearbyKitchenResponseSchema.parse(value);
  const start = request.page * request.size;
  const end = start + request.size;
  const totalElements = parsed.kitchens.length;
  const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / request.size);
  const kitchens = parsed.kitchens.slice(start, end).map(kitchen => ({
    id: kitchen.id,
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName,
    description: kitchen.description,
    areaName: kitchen.areaName,
    city: kitchen.city,
    state: null,
    latitude: kitchen.latitude,
    longitude: kitchen.longitude,
    distanceMeters: Math.max(0, Math.round((kitchen.distanceKm ?? 0) * 1000)),
    activeMenuItemCount: kitchen.activeMenuItemCount,
  }));

  return verifyResponseContext(
    nearbyKitchenPageSchema.parse({
      latitude: request.latitude,
      longitude: request.longitude,
      radiusMeters: request.radiusMeters,
      page: {
        page: request.page,
        size: request.size,
        totalElements,
        totalPages,
        hasNext: end < totalElements,
      },
      kitchens,
    }),
    request,
  );
}

export const nearbyChefDiscoveryApi = {
  async listNearbyKitchens(
    request: NearbyKitchenPageRequest,
    signal?: AbortSignal,
  ): Promise<NearbyKitchenPage> {
    const normalized = normalizeNearbyKitchenPageRequest(request);
    try {
      const response = await httpClient.get<unknown>(NEARBY_CHEF_DISCOVERY_PATH, {
        params: normalized,
        signal,
        dedupeKey: [
          'nearby-chef-discovery',
          normalized.latitude,
          normalized.longitude,
          normalized.radiusMeters,
          normalized.page,
          normalized.size,
          normalized.query ?? '',
          normalized.category ?? '',
          normalized.foodType ?? '',
          normalized.minPrice ?? '',
          normalized.maxPrice ?? '',
          normalized.maxPreparationTimeMinutes ?? '',
          normalized.spiceLevel ?? '',
          normalized.sort ?? '',
        ].join(':'),
      });

      const parsed = nearbyKitchenPageSchema.parse(response);
      return verifyResponseContext(parsed, normalized);
    } catch (primaryError) {
      if (
        normalized.query ||
        normalized.category ||
        normalized.foodType ||
        normalized.minPrice !== null ||
        normalized.maxPrice !== null ||
        normalized.maxPreparationTimeMinutes !== null ||
        normalized.spiceLevel ||
        normalized.sort !== 'DISTANCE_ASC'
      ) {
        throw primaryError;
      }
      try {
        const fallback = await httpClient.get<unknown>(LEGACY_NEARBY_CHEF_DISCOVERY_PATH, {
          params: {
            latitude: normalized.latitude,
            longitude: normalized.longitude,
            radiusKm: normalized.radiusMeters / 1000,
          },
          signal,
          dedupeKey: [
            'nearby-chef-discovery-fallback',
            normalized.latitude,
            normalized.longitude,
            normalized.radiusMeters,
          ].join(':'),
        });
        return mapLegacyNearbyKitchenPage(fallback, normalized);
      } catch {
        throw primaryError;
      }
    }
  },
};
