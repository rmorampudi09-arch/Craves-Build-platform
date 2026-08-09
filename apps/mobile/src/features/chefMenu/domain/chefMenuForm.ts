import {z} from 'zod';
import {
  CHEF_MENU_FOOD_TYPES,
  CHEF_MENU_SPICE_LEVELS,
  type ChefMenuItemRequest,
} from '../api/chefMenuApi';

const positivePriceText = z
  .string()
  .trim()
  .min(1, 'Price is required.')
  .refine(value => /^(?:\d+\.?\d*|\.\d+)$/.test(value), 'Enter a valid price.')
  .refine(value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0.01;
  }, 'Price must be at least 0.01.');

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

export const chefMenuFormSchema = z.object({
  itemName: z.string().trim().min(1, 'Item name is required.'),
  description: z.string(),
  category: z.string().trim().min(1, 'Category is required.'),
  foodType: z.enum(CHEF_MENU_FOOD_TYPES),
  price: positivePriceText,
  servesCount: optionalPositiveIntegerText(
    'Serves count must be a positive whole number.',
  ),
  preparationTimeMinutes: optionalPositiveIntegerText(
    'Preparation time must be a positive whole number.',
  ),
  spiceLevel: z.union([z.enum(CHEF_MENU_SPICE_LEVELS), z.literal('')]),
  unitPackageWeightGrams: positiveIntegerText(
    'Package weight is required.',
    'Package weight must be a positive whole number of grams.',
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

export function buildChefMenuItemRequest(
  values: ChefMenuFormValues,
  intent: ChefMenuSubmitIntent,
): ChefMenuItemRequest {
  const parsed = chefMenuFormSchema.parse(values);
  const description = parsed.description.trim();

  return {
    itemName: parsed.itemName,
    description: description.length > 0 ? description : null,
    category: parsed.category,
    foodType: parsed.foodType,
    price: Number(parsed.price),
    servesCount: optionalInteger(parsed.servesCount),
    preparationTimeMinutes: optionalInteger(parsed.preparationTimeMinutes),
    spiceLevel: parsed.spiceLevel || null,
    unitPackageWeightGrams: Number(parsed.unitPackageWeightGrams),
    thermoboxRequired: parsed.thermoboxRequired,
    available: parsed.available,
    status: intent === 'SAVE_DRAFT' ? 'DRAFT' : 'ACTIVE',
  };
}
