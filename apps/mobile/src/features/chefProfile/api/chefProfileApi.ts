import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChefKitchenStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

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
  };
}

export const chefProfileApi = {
  async getKitchen(signal?: AbortSignal): Promise<ChefKitchenProfile> {
    const response = await httpClient.get<unknown>('/api/v1/kitchens/me', {
      signal,
      dedupeKey: 'chef-profile:kitchen',
    });
    const parsed = parseChefKitchenProfile(response);
    if (!parsed) {
      throw new Error('Chef kitchen profile returned an unsupported response.');
    }
    return parsed;
  },
};
