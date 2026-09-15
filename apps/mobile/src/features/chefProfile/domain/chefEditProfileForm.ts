import {z} from 'zod';
import type {
  ChefKitchenProfile,
  ChefKitchenProfileRequest,
} from '../api/chefProfileApi';

const requiredText = (label: string, maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maxLength, `${label} is too long.`);

const optionalText = (label: string, maxLength: number) =>
  z.string().max(maxLength, `${label} is too long.`);

/**
 * P99 intentionally models only fields present in the exact Catalog Service
 * KitchenProfileRequest contract. Photo, cuisine, service-area lookup and social
 * links remain explicit integration boundaries until a concrete backend contract
 * exists; P100 must not invent fields for them.
 */
export const chefEditProfileFormSchema = z.object({
  kitchenName: requiredText('Kitchen name', 160),
  displayName: optionalText('Display name', 160),
  description: optionalText('Bio', 2_000),
  phoneNumber: optionalText('Phone number', 40),
  email: optionalText('Email', 320),
  addressLine1: requiredText('Address line 1', 240),
  addressLine2: optionalText('Address line 2', 240),
  landmark: optionalText('Landmark', 160),
  areaName: optionalText('Area', 160),
  city: requiredText('City', 120),
  state: requiredText('State', 120),
  postalCode: optionalText('Postal code', 32),
});

export type ChefEditProfileFormValues = z.infer<typeof chefEditProfileFormSchema>;

export type ChefEditProfileAddressSelection = Partial<
  Pick<
    ChefEditProfileFormValues,
    | 'addressLine1'
    | 'addressLine2'
    | 'landmark'
    | 'areaName'
    | 'city'
    | 'state'
    | 'postalCode'
  >
>;

export type ChefEditProfileBlockedCapability =
  | 'PHOTO_UPLOAD'
  | 'CUISINE_METADATA'
  | 'SERVICE_AREA_LOOKUP'
  | 'BUSINESS_VALIDATION'
  | 'SOCIAL_LINKS';

export interface ChefEditProfileCapabilityBoundary {
  capability: ChefEditProfileBlockedCapability;
  reason: string;
}

export const CHEF_EDIT_PROFILE_BLOCKED_CAPABILITIES: readonly ChefEditProfileCapabilityBoundary[] = [
  {
    capability: 'PHOTO_UPLOAD',
    reason:
      'No approved Chef profile photo upload/remove route or native picker contract is present in the repository.',
  },
  {
    capability: 'CUISINE_METADATA',
    reason:
      'No approved Chef cuisine metadata/read-write contract is present in the current service surface.',
  },
  {
    capability: 'SERVICE_AREA_LOOKUP',
    reason:
      'The current kitchen contract exposes address and areaName fields but no Chef service-area lookup/selection API.',
  },
  {
    capability: 'BUSINESS_VALIDATION',
    reason:
      'The current Catalog Service exposes the kitchen GET/PUT contract but no separate Chef business-validation capability.',
  },
  {
    capability: 'SOCIAL_LINKS',
    reason:
      'Social-link fields are not part of the exact KitchenProfileRequest contract.',
  },
] as const;

function valueOrEmpty(value: string | null): string {
  return value ?? '';
}

function nullableTrimmed(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function chefKitchenProfileToFormValues(
  profile: ChefKitchenProfile,
): ChefEditProfileFormValues {
  return {
    kitchenName: profile.kitchenName,
    displayName: valueOrEmpty(profile.displayName),
    description: valueOrEmpty(profile.description),
    phoneNumber: valueOrEmpty(profile.phoneNumber),
    email: valueOrEmpty(profile.email),
    addressLine1: profile.addressLine1,
    addressLine2: valueOrEmpty(profile.addressLine2),
    landmark: valueOrEmpty(profile.landmark),
    areaName: valueOrEmpty(profile.areaName),
    city: profile.city,
    state: profile.state,
    postalCode: valueOrEmpty(profile.postalCode),
  };
}

/**
 * Address child selectors must merge only the fields they own. This preserves
 * every unrelated unsaved profile edit while the user temporarily leaves the
 * main form.
 */
export function mergeChefEditProfileAddressSelection(
  current: ChefEditProfileFormValues,
  selection: ChefEditProfileAddressSelection,
): ChefEditProfileFormValues {
  return {...current, ...selection};
}

/**
 * PUT /api/v1/kitchens/me replaces the complete KitchenProfileRequest. Keep
 * server-owned coordinates and status from the canonical profile while mapping
 * every editable form field into that exact request shape.
 */
export function buildChefKitchenProfileReplacementRequest(
  values: ChefEditProfileFormValues,
  existing: ChefKitchenProfile,
): ChefKitchenProfileRequest {
  const parsed = chefEditProfileFormSchema.parse(values);

  return {
    kitchenName: parsed.kitchenName,
    displayName: nullableTrimmed(parsed.displayName),
    description: nullableTrimmed(parsed.description),
    phoneNumber: nullableTrimmed(parsed.phoneNumber),
    email: nullableTrimmed(parsed.email),
    addressLine1: parsed.addressLine1,
    addressLine2: nullableTrimmed(parsed.addressLine2),
    landmark: nullableTrimmed(parsed.landmark),
    areaName: nullableTrimmed(parsed.areaName),
    city: parsed.city,
    state: parsed.state,
    postalCode: nullableTrimmed(parsed.postalCode),
    latitude: existing.latitude,
    longitude: existing.longitude,
    status: existing.status,
  };
}

export function canEditChefKitchenProfile(profile: ChefKitchenProfile): boolean {
  return profile.status !== 'SUSPENDED';
}
