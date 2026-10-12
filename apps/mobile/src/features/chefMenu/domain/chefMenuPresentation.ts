import {menuCategoryLabel} from '../../../shared/catalog/menuCategories';
import type {ChefMenuItem} from '../api/chefMenuApi';

export const CHEF_MENU_STATUS_FILTERS = [
  'ALL',
  'AVAILABLE',
  'UNAVAILABLE',
  'DRAFT',
  'INACTIVE',
  /** Everything customers cannot order: switched off, or inactive. Drafts have their own filter. */
  'OFF',
] as const;

export type ChefMenuStatusFilter =
  (typeof CHEF_MENU_STATUS_FILTERS)[number];

export type ChefMenuDisplayState = Exclude<ChefMenuStatusFilter, 'ALL' | 'OFF'>;

export interface ChefMenuSummary {
  total: number;
  available: number;
  unavailable: number;
  draft: number;
  inactive: number;
}

export function formatChefMenuCategory(value: string): string {
  const normalized = value.trim();
  return normalized.toLocaleLowerCase() === 'biriyani' ? 'Biryani' : normalized;
}

/** The category as the chef reads it: legacy Biriyani as Biryani, the stored Snakes as Snacks. */
export function chefMenuCategoryLabel(value: string): string {
  return menuCategoryLabel(formatChefMenuCategory(value));
}

export function getChefMenuDisplayState(
  item: ChefMenuItem,
): ChefMenuDisplayState {
  if (item.status === 'DRAFT') {
    return 'DRAFT';
  }
  if (item.status === 'INACTIVE') {
    return 'INACTIVE';
  }
  return item.available ? 'AVAILABLE' : 'UNAVAILABLE';
}

export function deriveChefMenuSummary(
  items: readonly ChefMenuItem[],
): ChefMenuSummary {
  return items.reduce<ChefMenuSummary>(
    (summary, item) => {
      const state = getChefMenuDisplayState(item);
      summary.total += 1;
      if (state === 'AVAILABLE') {
        summary.available += 1;
      } else if (state === 'UNAVAILABLE') {
        summary.unavailable += 1;
      } else if (state === 'DRAFT') {
        summary.draft += 1;
      } else {
        summary.inactive += 1;
      }
      return summary;
    },
    {total: 0, available: 0, unavailable: 0, draft: 0, inactive: 0},
  );
}

export function getChefMenuCategories(
  items: readonly ChefMenuItem[],
): string[] {
  return Array.from(
    new Set(items.map(item => formatChefMenuCategory(item.category))),
  ).sort((a, b) => a.localeCompare(b));
}

export function filterChefMenuItems(
  items: readonly ChefMenuItem[],
  query: string,
  category: string | null,
  statusFilter: ChefMenuStatusFilter,
): ChefMenuItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return items.filter(item => {
    const displayCategory = formatChefMenuCategory(item.category);
    if (category !== null && displayCategory !== category) {
      return false;
    }
    const state = getChefMenuDisplayState(item);
    if (
      statusFilter === 'OFF'
        ? state !== 'UNAVAILABLE' && state !== 'INACTIVE'
        : statusFilter !== 'ALL' && state !== statusFilter
    ) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    return [item.itemName, item.description ?? '', displayCategory, menuCategoryLabel(displayCategory)]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}

/**
 * The dish row's second line, after the category: how long it takes, or what is wrong.
 * A draft has none (its Draft chip says it). `off` marks the one note shown in red.
 */
export function chefMenuRowNote(item: ChefMenuItem): {text: string; off: boolean} | null {
  const state = getChefMenuDisplayState(item);
  if (state === 'DRAFT') {
    return null;
  }
  if (state === 'UNAVAILABLE' || state === 'INACTIVE') {
    return {text: 'Off for customers', off: true};
  }
  return {
    text: item.preparationTimeMinutes == null ? 'prep time missing' : `${item.preparationTimeMinutes} min`,
    off: false,
  };
}

export function getChefMenuPrimaryImageUrl(item: ChefMenuItem): string | null {
  const primary = item.images.find(image => image.primary) ?? item.images[0];
  return primary?.publicUrl ?? null;
}
