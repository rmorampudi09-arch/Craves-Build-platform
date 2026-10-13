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

type FormValue = ChefEditProfileFormValues[keyof ChefEditProfileFormValues];
const asText = (value: FormValue) => (Array.isArray(value) ? value.join('|') : value ?? '');
const sameValue = (a: FormValue, b: FormValue) => asText(a) === asText(b);

export type ChefEditProfileFieldErrors = Partial<Record<keyof ChefEditProfileFormValues, string>>;

/**
 * The first problem of each field the chef changed, or null. A value the chef did not touch is never
 * checked: something already stored over a limit must not stop an unrelated change from being saved.
 */
export function validateChefEditProfileForm(
  values: ChefEditProfileFormValues,
  original: ChefEditProfileFormValues,
): ChefEditProfileFieldErrors | null {
  const result = chefEditProfileFormSchema.safeParse(values);
  if (result.success) {
    return null;
  }
  const found: ChefEditProfileFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ChefEditProfileFormValues | undefined;
    if (field && !found[field] && !sameValue(values[field], original[field])) {
      found[field] = issue.message;
    }
  }
  return Object.keys(found).length > 0 ? found : null;
}

/**
 * PUT /api/v1/kitchens/me replaces the complete KitchenProfileRequest. `existing` must be the kitchen as
 * the server has it right now: its status and coordinates are sent back as they are, so an old copy would
 * undo a change made since (closing the kitchen, a suspension). Validation is `validateChefEditProfileForm`'s job.
 */
export function buildChefKitchenProfileReplacementRequest(
  values: ChefEditProfileFormValues,
  existing: ChefKitchenProfile,
): ChefKitchenProfileRequest {
  return {
    kitchenName: values.kitchenName.trim(),
    displayName: nullableTrimmed(values.displayName),
    description: nullableTrimmed(values.description),
    phoneNumber: nullableTrimmed(values.phoneNumber),
    email: nullableTrimmed(values.email),
    addressLine1: values.addressLine1.trim(),
    addressLine2: nullableTrimmed(values.addressLine2),
    landmark: nullableTrimmed(values.landmark),
    areaName: nullableTrimmed(values.areaName),
    city: values.city.trim(),
    state: values.state.trim(),
    postalCode: nullableTrimmed(values.postalCode),
    latitude: existing.latitude,
    longitude: existing.longitude,
    status: existing.status,
    // Only what the server sent is sent back. The links go as a set of four: the server replaces all of them.
    ...(values.cuisines ? {cuisines: values.cuisines.map(item => item.trim())} : {}),
    ...(values.serviceAreas ? {serviceAreas: values.serviceAreas.map(item => item.trim())} : {}),
    ...(values.instagram !== undefined
      ? {
          socialLinks: {
            instagram: nullableTrimmed(values.instagram),
            facebook: nullableTrimmed(values.facebook ?? ''),
            youtube: nullableTrimmed(values.youtube ?? ''),
            website: nullableTrimmed(values.website ?? ''),
          },
        }
      : {}),
  };
}

export function canEditChefKitchenProfile(profile: ChefKitchenProfile): boolean {
  return profile.status !== 'SUSPENDED';
}
