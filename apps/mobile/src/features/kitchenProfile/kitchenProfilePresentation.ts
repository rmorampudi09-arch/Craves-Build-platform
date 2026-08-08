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

/**
 * The public kitchen menu is currently returned in backend category/name order.
 * A bounded preview must preserve that order and must never imply popularity,
 * recommendation quality, or a "Top Dishes" ranking that the contract lacks.
 */
export function getCustomerKitchenMenuPreview(
  items: readonly CustomerKitchenMenuItemSummary[],
  limit = 4,
): readonly CustomerKitchenMenuItemSummary[] {
  const safeLimit = Math.max(0, Math.min(Math.trunc(limit), 6));
  return items.slice(0, safeLimit);
}

export function getCustomerKitchenMenuImage(
  item: CustomerKitchenMenuItemSummary,
): CustomerKitchenMenuImage | null {
  return item.images.find(image => image.primary) ?? item.images[0] ?? null;
}
