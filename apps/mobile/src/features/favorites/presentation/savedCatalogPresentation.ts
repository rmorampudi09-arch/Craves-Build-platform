import type {
  SavedCatalogAvailabilityState,
  SavedCatalogItem,
} from '../api/savedCatalogApi';

export type SavedAvailabilityTone = 'positive' | 'attention' | 'muted';

export interface SavedAvailabilityCopy {
  title: string;
  detail: string | null;
  tone: SavedAvailabilityTone;
}

function nextTimeCopy(nextAvailabilityAt: string | null): string | null {
  if (!nextAvailabilityAt) return null;
  const date = new Date(nextAvailabilityAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function availabilityCopyForState(
  state: SavedCatalogAvailabilityState,
  nextAvailabilityAt: string | null,
): SavedAvailabilityCopy {
  const nextTime = nextTimeCopy(nextAvailabilityAt);
  switch (state) {
    case 'AVAILABLE_NOW':
      return {
        title: 'Cooking now',
        detail: 'This saved dish is currently available to order.',
        tone: 'positive',
      };
    case 'COOKING_LATER_TODAY':
      return {
        title: 'Cooking later today',
        detail: nextTime ? `Next kitchen window starts around ${nextTime}.` : null,
        tone: 'attention',
      };
    case 'NOT_TODAY':
      return {
        title: 'Not cooking today',
        detail: nextTime ? `Next known kitchen window starts ${nextTime}.` : null,
        tone: 'muted',
      };
    case 'PAUSED':
      return {
        title: 'Kitchen paused',
        detail: nextTime ? `Next known kitchen window starts around ${nextTime}.` : null,
        tone: 'attention',
      };
    case 'KITCHEN_NOT_ACCEPTING':
      return {
        title: 'Not taking orders',
        detail: 'We will not guess when this kitchen will reopen.',
        tone: 'muted',
      };
    case 'ITEM_UNAVAILABLE':
      return {
        title: 'Not available right now',
        detail: 'The dish is still saved. The catalog does not say why it is unavailable.',
        tone: 'muted',
      };
    case 'RETIRED':
      return {
        title: 'No longer on the menu',
        detail: 'Kept here so your saved-food history does not disappear silently.',
        tone: 'muted',
      };
    case 'KITCHEN_INACTIVE':
      return {
        title: 'Kitchen unavailable',
        detail: 'This saved dish remains remembered until you remove it.',
        tone: 'muted',
      };
    case 'MISSING':
      return {
        title: 'Dish no longer listed',
        detail: 'You can remove this saved item whenever you are ready.',
        tone: 'muted',
      };
  }
}

export function availabilityCopyForItem(
  item: SavedCatalogItem,
): SavedAvailabilityCopy {
  return availabilityCopyForState(
    item.availabilityState,
    item.nextAvailabilityAt,
  );
}

export function canOpenSavedDish(item: SavedCatalogItem): boolean {
  return Boolean(
    item.found && item.itemStatus === 'ACTIVE' && item.kitchenStatus === 'ACTIVE',
  );
}

export function savedDishDisplayName(item: SavedCatalogItem): string {
  return item.itemName?.trim() || 'Saved dish';
}

export function savedKitchenDisplayName(item: SavedCatalogItem): string {
  return (
    item.kitchenDisplayName?.trim() ||
    item.kitchenName?.trim() ||
    'Home kitchen'
  );
}
