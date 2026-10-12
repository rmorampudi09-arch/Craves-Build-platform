import {z} from 'zod';
import {
  CHEF_MENU_FOOD_TYPES,
  CHEF_MENU_SPICE_LEVELS,
  type ChefMenuItem,
  type ChefMenuItemRequest,
} from '../api/chefMenuApi';

const positivePriceText = z
  .string()
  .trim()
  .min(1, 'Enter a price.')
  .refine(value => /^(?:\d+\.?\d*|\.\d+)$/.test(value), 'Enter a valid price.')
  .refine(value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0.01;
  }, 'Price must be at least ₹0.01.');

const positiveIntegerText = (requiredMessage: string, invalidMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .refine(value => /^[1-9]\d*$/.test(value), invalidMessage)
    .refine(value => Number.isSafeInteger(Number(value)), invalidMessage);

const optionalPositiveIntegerText = (invalidMessage: string) =>
  z.string().refine(value => {
    const normalized = value.trim();
    return (
      normalized.length === 0 ||
      (/^[1-9]\d*$/.test(normalized) && Number.isSafeInteger(Number(normalized)))
    );
  }, invalidMessage);

function normalizeMenuCategory(value: string): string {
  const normalized = value.trim();
  return normalized.toLocaleLowerCase() === 'biriyani' ? 'Biryani' : normalized;
}

export const chefMenuFormSchema = z.object({
  itemName: z.string().trim().min(1, 'Enter the dish name.'),
  description: z.string(),
  category: z.string().trim().min(1, 'Choose a category.'),
  foodType: z.enum(CHEF_MENU_FOOD_TYPES),
  price: positivePriceText,
  servesCount: optionalPositiveIntegerText('Serves must be a whole number, like 2.'),
  preparationTimeMinutes: optionalPositiveIntegerText(
    'Ready in must be a whole number of minutes.',
  ),
  spiceLevel: z.union([z.enum(CHEF_MENU_SPICE_LEVELS), z.literal('')]),
  unitPackageWeightGrams: positiveIntegerText(
    'Enter the packed weight in grams.',
    'Packed weight must be a whole number of grams.',
  ),
  thermoboxRequired: z.boolean(),
  available: z.boolean(),
});

export type ChefMenuFormValues = z.infer<typeof chefMenuFormSchema>;
export type ChefMenuSubmitIntent = 'SAVE_DRAFT' | 'ADD_ITEM';

export const EMPTY_CHEF_MENU_FORM: ChefMenuFormValues = {
  itemName: '',
  description: '',
  category: '',
  foodType: 'VEG',
  price: '',
  servesCount: '',
  preparationTimeMinutes: '',
  spiceLevel: '',
  unitPackageWeightGrams: '',
  thermoboxRequired: false,
  available: false,
};

function optionalInteger(value: string): number | null {
  const normalized = value.trim();
  return normalized.length === 0 ? null : Number(normalized);
}

function parsedRequestFields(values: ChefMenuFormValues) {
  const parsed = chefMenuFormSchema.parse(values);
  const description = parsed.description.trim();

  return {
    itemName: parsed.itemName,
    description: description.length > 0 ? description : null,
    category: normalizeMenuCategory(parsed.category),
    foodType: parsed.foodType,
    price: Number(parsed.price),
    servesCount: optionalInteger(parsed.servesCount),
    preparationTimeMinutes: optionalInteger(parsed.preparationTimeMinutes),
    spiceLevel: parsed.spiceLevel || null,
    unitPackageWeightGrams: Number(parsed.unitPackageWeightGrams),
    thermoboxRequired: parsed.thermoboxRequired,
    available: parsed.available,
  } satisfies Omit<ChefMenuItemRequest, 'currency' | 'status'>;
}

export function buildChefMenuItemRequest(
  values: ChefMenuFormValues,
  intent: ChefMenuSubmitIntent,
): ChefMenuItemRequest {
  // Publishing means customers can order it now: ACTIVE and switched on, whatever the form held.
  const fields = parsedRequestFields(values);
  return intent === 'SAVE_DRAFT'
    ? {...fields, status: 'DRAFT'}
    : {...fields, status: 'ACTIVE', available: true};
}

/**
 * PUT is a full-replacement contract. Editing therefore pre-fills every writable
 * request field from the canonical list response rather than manufacturing a
 * partial patch object.
 */
export function chefMenuItemToFormValues(item: ChefMenuItem): ChefMenuFormValues {
  return {
    itemName: item.itemName,
    description: item.description ?? '',
    category: normalizeMenuCategory(item.category),
    foodType: item.foodType,
    price: String(item.price),
    servesCount: item.servesCount == null ? '' : String(item.servesCount),
    preparationTimeMinutes:
      item.preparationTimeMinutes == null
        ? ''
        : String(item.preparationTimeMinutes),
    spiceLevel: item.spiceLevel ?? '',
    unitPackageWeightGrams: String(item.unitPackageWeightGrams),
    thermoboxRequired: item.thermoboxRequired,
    available: item.available,
  };
}

/**
 * Preserve server-owned edit context that is not changed by the P95 form.
 * Currency and status are sent because PUT replaces the complete MenuItemRequest;
 * availability is intentionally editable because it is an approved request field.
 */
export function buildChefMenuReplacementRequest(
  values: ChefMenuFormValues,
  existingItem: ChefMenuItem,
): ChefMenuItemRequest {
  return {
    ...parsedRequestFields(values),
    currency: existingItem.currency,
    status: existingItem.status,
  };
}

/** Publishing an existing draft: the same full replacement, but ACTIVE and switched on. */
export function buildChefMenuPublishRequest(
  values: ChefMenuFormValues,
  existingItem: ChefMenuItem,
): ChefMenuItemRequest {
  return {...buildChefMenuReplacementRequest(values, existingItem), status: 'ACTIVE', available: true};
}
