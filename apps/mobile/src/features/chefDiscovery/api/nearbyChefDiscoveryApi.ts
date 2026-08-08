import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const NEARBY_CHEF_DISCOVERY_PATH = '/api/v1/discovery/kitchens';
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
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
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

export type NearbyKitchen = z.infer<typeof nearbyKitchenSchema>;
export type NearbyKitchenPage = z.infer<typeof nearbyKitchenPageSchema>;

export interface NearbyKitchenPageRequest {
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

export function normalizeNearbyKitchenPageRequest(
  request: NearbyKitchenPageRequest,
): NearbyKitchenPageRequest {
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

export const nearbyChefDiscoveryApi = {
  async listNearbyKitchens(
    request: NearbyKitchenPageRequest,
    signal?: AbortSignal,
  ): Promise<NearbyKitchenPage> {
    const normalized = normalizeNearbyKitchenPageRequest(request);
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
      ].join(':'),
    });

    const parsed = nearbyKitchenPageSchema.parse(response);
    return verifyResponseContext(parsed, normalized);
  },
};
