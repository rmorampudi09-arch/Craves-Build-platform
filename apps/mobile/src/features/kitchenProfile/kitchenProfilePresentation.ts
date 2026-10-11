import type {
  CustomerKitchenMenuImage,
  CustomerKitchenMenuItemSummary,
  CustomerKitchenProfile,
} from './api/kitchenProfileApi';

export function getCustomerKitchenInitials(
  kitchen: Pick<CustomerKitchenProfile, 'kitchenName' | 'displayName'>,
): string {
  const source = (kitchen.displayName ?? kitchen.kitchenName).trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'CK';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function formatCustomerKitchenLocation(
  location: CustomerKitchenProfile['location'],
): string | null {
  const unique: string[] = [];
  [location.areaName, location.city, location.state].forEach(value => {
    const normalized = value?.trim();
    if (
      normalized &&
      !unique.some(item => item.toLocaleLowerCase() === normalized.toLocaleLowerCase())
    ) {
      unique.push(normalized);
    }
  });
  return unique.length > 0 ? unique.join(', ') : null;
}

export function formatCustomerKitchenJoinedLabel(joinedAt: string | null): string | null {
  if (!joinedAt) {
    return null;
  }
  const timestamp = Date.parse(joinedAt);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return `On Craves since ${new Date(timestamp).getUTCFullYear()}`;
}

export interface CustomerKitchenMenuSection {
  category: string;
  items: CustomerKitchenMenuItemSummary[];
}

/**
 * Groups the public menu by category in first-seen order (case-insensitive).
 * The backend already returns category/name order, so this never implies a
 * popularity or "Top Dishes" ranking that the contract lacks.
 */
export function groupCustomerKitchenMenu(
  items: readonly CustomerKitchenMenuItemSummary[],
): readonly CustomerKitchenMenuSection[] {
  const sections = new Map<string, CustomerKitchenMenuSection>();
  items.forEach(item => {
    const category = item.category.trim() || 'Other';
    const key = category.toLocaleLowerCase();
    const section = sections.get(key) ?? {category, items: []};
    section.items.push(item);
    sections.set(key, section);
  });
  return [...sections.values()];
}

export function getCustomerKitchenFoodMixLabel(
  items: readonly CustomerKitchenMenuItemSummary[],
): string | null {
  const types = new Set(items.map(item => item.foodType));
  const veg = types.has('VEG');
  const nonVeg = types.has('NON_VEG') || types.has('EGG');
  if (veg && nonVeg) return 'Veg & non-veg';
  if (veg) return 'Pure veg';
  if (types.has('NON_VEG')) return 'Non-veg';
  return types.has('EGG') ? 'Egg' : null;
}

/** Preparation time only; this is not a delivery estimate. */
export function formatCustomerKitchenPrepRange(
  items: readonly CustomerKitchenMenuItemSummary[],
): string | null {
  const minutes = items
    .map(item => item.preparationTimeMinutes)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  if (minutes.length === 0) return null;
  const low = Math.min(...minutes);
  const high = Math.max(...minutes);
  return low === high ? `${low} min` : `${low}–${high} min`;
}

/** Index of the last section whose top has reached the offset (0 before any has). */
export function getActiveMenuSectionIndex(
  sectionTops: readonly number[],
  offset: number,
): number {
  let active = 0;
  sectionTops.forEach((top, index) => {
    if (top <= offset) active = index;
  });
  return active;
}

export function getCustomerKitchenMenuImage(
  item: CustomerKitchenMenuItemSummary,
): CustomerKitchenMenuImage | null {
  return item.images.find(image => image.primary) ?? item.images[0] ?? null;
}
