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

const tagList = (label: string) =>
  z
    .array(z.string().trim().min(1).max(40, `Each ${label} must be 40 characters or fewer.`))
    .max(10, `Choose up to 10 ${label}s.`)
    .optional();

const link = (label: string) =>
  z
    .string()
    .trim()
    .max(200, `${label} link is too long.`)
    .refine(value => value === '' || /^https:\/\//i.test(value), `${label} link must start with https://`)
    .optional();

/**
 * The kitchen fields of PUT /api/v1/kitchens/me. The cuisines, delivery areas and four links are
 * optional here because the server sends them only once the new kitchen fields are published:
 * a kitchen without them is edited, and saved, without them.
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
  cuisines: tagList('cuisine'),
  serviceAreas: tagList('delivery area'),
  instagram: link('Instagram'),
  facebook: link('Facebook'),
  youtube: link('YouTube'),
  website: link('Website'),
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
    ...(profile.cuisines ? {cuisines: profile.cuisines} : {}),
    ...(profile.serviceAreas ? {serviceAreas: profile.serviceAreas} : {}),
    ...(profile.socialLinks
      ? {
          instagram: valueOrEmpty(profile.socialLinks.instagram),
          facebook: valueOrEmpty(profile.socialLinks.facebook),
          youtube: valueOrEmpty(profile.socialLinks.youtube),
          website: valueOrEmpty(profile.socialLinks.website),
        }
      : {}),
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
    // Only what the server sent is sent back. The links go as a set of four: the server replaces all of them.
    ...(parsed.cuisines ? {cuisines: parsed.cuisines} : {}),
    ...(parsed.serviceAreas ? {serviceAreas: parsed.serviceAreas} : {}),
    ...(parsed.instagram !== undefined
      ? {
          socialLinks: {
            instagram: nullableTrimmed(parsed.instagram),
            facebook: nullableTrimmed(parsed.facebook ?? ''),
            youtube: nullableTrimmed(parsed.youtube ?? ''),
            website: nullableTrimmed(parsed.website ?? ''),
          },
        }
      : {}),
  };
}

export function canEditChefKitchenProfile(profile: ChefKitchenProfile): boolean {
  return profile.status !== 'SUSPENDED';
}
