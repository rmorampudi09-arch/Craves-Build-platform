import type {ChefMenuItem} from '../api/chefMenuApi';

export const CHEF_MENU_STATUS_FILTERS = [
  'ALL',
  'AVAILABLE',
  'UNAVAILABLE',
  'DRAFT',
  'INACTIVE',
] as const;

export type ChefMenuStatusFilter =
  (typeof CHEF_MENU_STATUS_FILTERS)[number];

export type ChefMenuDisplayState = Exclude<ChefMenuStatusFilter, 'ALL'>;

export interface ChefMenuSummary {
  total: number;
  available: number;
  unavailable: number;
  draft: number;
  inactive: number;
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
  return Array.from(new Set(items.map(item => item.category))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function filterChefMenuItems(
  items: readonly ChefMenuItem[],
  query: string,
  category: string | null,
  statusFilter: ChefMenuStatusFilter,
): ChefMenuItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return items.filter(item => {
    if (category !== null && item.category !== category) {
      return false;
    }
    if (
      statusFilter !== 'ALL' &&
      getChefMenuDisplayState(item) !== statusFilter
    ) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    return [item.itemName, item.description ?? '', item.category]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}

export function getChefMenuPrimaryImageUrl(item: ChefMenuItem): string | null {
  const primary = item.images.find(image => image.primary) ?? item.images[0];
  return primary?.publicUrl ?? null;
}

export function formatChefMenuPrice(item: ChefMenuItem): string {
  const amount = item.price.toFixed(2);
  return item.currency === 'INR' ? `₹${amount}` : `${item.currency} ${amount}`;
}

export function chefMenuStatusLabel(state: ChefMenuDisplayState): string {
  if (state === 'AVAILABLE') {
    return 'Available';
  }
  if (state === 'UNAVAILABLE') {
    return 'Unavailable';
  }
  if (state === 'DRAFT') {
    return 'Draft';
  }
  return 'Inactive';
}
