import {toAppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {chefOnboardingApi, type OnboardingDetails} from '../../chefOnboarding/api/chefOnboardingApi';

// Manifest marker for the APIM coverage check; screens fall back to Coming soon at runtime.
export const CHEF_KITCHEN_PHOTOS_AVAILABLE = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChefKitchenStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface ChefKitchenSocialLinks {
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  website: string | null;
}

export type ChefKitchenPhotoKind = 'CHEF' | 'KITCHEN';

export interface ChefKitchenProfile {
  id: string;
  identityId: string;
  kitchenName: string;
  displayName: string | null;
  description: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ChefKitchenStatus;
  createdAt: string;
  updatedAt: string;
  // The fields below are undefined until the server sends them; a screen shows its UI only when they are present.
  chefPhotoUrl?: string | null;
  kitchenPhotoUrl?: string | null;
  /** Filled kitchen photo slots in order (slot 1 is kitchenPhotoUrl); chefs can fill an empty slot but never replace one. */
  kitchenPhotoUrls?: string[];
  cuisines?: string[];
  serviceAreas?: string[];
  socialLinks?: ChefKitchenSocialLinks;
}

/**
 * Exact Catalog Service KitchenProfileRequest contract used by
 * PUT /api/v1/kitchens/me. PUT is a complete replacement/upsert request, not a
 * partial profile patch, so callers must preserve fields that are not edited.
 */
export interface ChefKitchenProfileRequest {
  kitchenName: string;
  displayName: string | null;
  description: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ChefKitchenStatus;
  /** Absent keeps what the server has. A socialLinks object replaces all four links, so it always carries all four. */
  cuisines?: string[];
  serviceAreas?: string[];
  socialLinks?: ChefKitchenSocialLinks;
}

const KITCHEN_STATUSES = new Set<ChefKitchenStatus>([
  'DRAFT',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized || null : undefined;
}

function coordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (value == null || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function photoUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' && /^https:\/\//i.test(value) && value.length <= 2_048 ? value : null;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string') ? (value as string[]) : undefined;
}

function socialLinks(value: unknown): ChefKitchenSocialLinks | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const link = (entry: unknown) => (typeof entry === 'string' && entry.trim() ? entry.trim() : null);
  return {
    instagram: link(raw.instagram),
    facebook: link(raw.facebook),
    youtube: link(raw.youtube),
    website: link(raw.website),
  };
}

export function parseChefKitchenProfile(value: unknown): ChefKitchenProfile | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const id = requiredString(raw.id, 64);
  const identityId = requiredString(raw.identityId, 64);
  const kitchenName = requiredString(raw.kitchenName, 160);
  const displayName = optionalString(raw.displayName, 160);
  const description = optionalString(raw.description, 2_000);
  const phoneNumber = optionalString(raw.phoneNumber, 40);
  const email = optionalString(raw.email, 320);
  const addressLine1 = requiredString(raw.addressLine1, 240);
  const addressLine2 = optionalString(raw.addressLine2, 240);
  const landmark = optionalString(raw.landmark, 160);
  const areaName = optionalString(raw.areaName, 160);
  const city = requiredString(raw.city, 120);
  const state = requiredString(raw.state, 120);
  const postalCode = optionalString(raw.postalCode, 32);
  const latitude = coordinate(raw.latitude, -90, 90);
  const longitude = coordinate(raw.longitude, -180, 180);
  const status = requiredString(raw.status, 20) as ChefKitchenStatus | null;
  const createdAt = timestamp(raw.createdAt);
  const updatedAt = timestamp(raw.updatedAt);
  const cuisines = stringList(raw.cuisines);
  const serviceAreas = stringList(raw.serviceAreas);
  const links = socialLinks(raw.socialLinks);

  if (
    !id ||
    !UUID_PATTERN.test(id) ||
    !identityId ||
    !UUID_PATTERN.test(identityId) ||
    !kitchenName ||
    displayName === undefined ||
    description === undefined ||
    phoneNumber === undefined ||
    email === undefined ||
    !addressLine1 ||
    addressLine2 === undefined ||
    landmark === undefined ||
    areaName === undefined ||
    !city ||
    !state ||
    postalCode === undefined ||
    latitude === undefined ||
    longitude === undefined ||
    !status ||
    !KITCHEN_STATUSES.has(status) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    identityId,
    kitchenName,
    displayName,
    description,
    phoneNumber,
    email,
    addressLine1,
    addressLine2,
    landmark,
    areaName,
    city,
    state,
    postalCode,
    latitude,
    longitude,
    status,
    createdAt,
    updatedAt,
    // Spread only what the server sent, so a screen can tell "not published yet" from "empty".
    ...(raw.chefPhotoUrl !== undefined ? {chefPhotoUrl: photoUrl(raw.chefPhotoUrl)} : {}),
    ...(raw.kitchenPhotoUrl !== undefined ? {kitchenPhotoUrl: photoUrl(raw.kitchenPhotoUrl)} : {}),
    ...(Array.isArray(raw.kitchenPhotoUrls)
      ? {kitchenPhotoUrls: raw.kitchenPhotoUrls.map(photoUrl).filter((url): url is string => typeof url === 'string')}
      : {}),
    ...(cuisines ? {cuisines} : {}),
    ...(serviceAreas ? {serviceAreas} : {}),
    ...(links ? {socialLinks: links} : {}),
  };
}

function parseKitchenResponse(value: unknown): ChefKitchenProfile {
  const parsed = parseChefKitchenProfile(value);
  if (!parsed) {
    throw new Error('Chef kitchen profile returned an unsupported response.');
  }
  return parsed;
}

const orNull = (value: string) => value.trim() || null;

/**
 * The kitchen an approved chef already described in the application (website: chef-kitchen-handoff.ts).
 * Null when something the kitchen needs is missing; the kitchen editor then asks for it.
 */
export function kitchenFromApplication(
  details: OnboardingDetails,
  phoneNumber: string,
): ChefKitchenProfileRequest | null {
  if (![details.kitchenName, details.addressLine1, details.city, details.state].every(value => value.trim())) {
    return null;
  }
  return {
    kitchenName: details.kitchenName.trim(),
    displayName: orNull([details.firstName, details.lastName].join(' ')),
    description: orNull(details.kitchenDescription),
    phoneNumber: orNull(phoneNumber),
    email: orNull(details.email),
    addressLine1: details.addressLine1.trim(),
    addressLine2: orNull(details.addressLine2),
    landmark: orNull(details.landmark),
    // The application's "Street / area" ends with the area, which pickup partners look for.
    areaName: orNull(details.addressLine2.split(',').pop() ?? ''),
    city: details.city.trim(),
    state: details.state.trim(),
    postalCode: orNull(details.postalCode),
    latitude: details.latitude,
    longitude: details.longitude,
    // Closed to orders until the chef opens it, once there is a dish to sell.
    status: 'DRAFT',
  };
}

export const chefProfileApi = {
  async getKitchen(signal?: AbortSignal): Promise<ChefKitchenProfile> {
    try {
      const response = await httpClient.get<unknown>('/api/v1/kitchens/me', {
        signal,
        dedupeKey: 'chef-profile:kitchen',
      });
      return parseKitchenResponse(response);
    } catch (error) {
      // A newly approved chef has no kitchen yet: save the one from the application, as the website does.
      if (toAppApiError(error).code !== 'KITCHEN_PROFILE_NOT_FOUND') throw error;
      const onboarding = await chefOnboardingApi.load().catch(() => null);
      const request =
        onboarding?.details && onboarding.application.status === 'APPROVED'
          ? kitchenFromApplication(onboarding.details, onboarding.phoneNumber)
          : null;
      if (!request) throw error;
      return chefProfileApi.replaceKitchen(request, signal);
    }
  },

  async replaceKitchen(
    request: ChefKitchenProfileRequest,
    signal?: AbortSignal,
  ): Promise<ChefKitchenProfile> {
    const response = await httpClient.put<unknown>('/api/v1/kitchens/me', request, {
      signal,
    });
    return parseKitchenResponse(response);
  },

  /** Sets the chef's own photo or the kitchen photo; the response is the kitchen with its new photo link. */
  async uploadPhoto(
    kind: ChefKitchenPhotoKind,
    photo: {uri: string; name: string; type: string},
    signal?: AbortSignal,
  ): Promise<ChefKitchenProfile> {
    const body = new FormData();
    body.append('file', photo as unknown as Blob);
    return parseKitchenResponse(await httpClient.post<unknown>(`/api/v1/kitchens/me/photos?kind=${kind}`, body, {signal}));
  },

  async deletePhoto(kind: ChefKitchenPhotoKind, signal?: AbortSignal): Promise<ChefKitchenProfile> {
    return parseKitchenResponse(await httpClient.delete<unknown>(`/api/v1/kitchens/me/photos/${kind}`, {signal}));
  },

  /** Picks one of the 18 drawn faces as the chef's public picture; the response is the kitchen with its new picture link. */
  async setAvatar(avatarId: string, signal?: AbortSignal): Promise<ChefKitchenProfile> {
    return parseKitchenResponse(await httpClient.put<unknown>('/api/v1/kitchens/me/chef-avatar', {avatarId}, {signal}));
  },
};
