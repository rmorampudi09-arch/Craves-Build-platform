import {dishMatchesLabels} from '../dishLabels/domain/dishLabels';
import type {NearbyDishLabels} from '../dishLabels/state/nearbyDishLabels';
import type {NearbyDish} from '../home/api/homeFeedApi';
import type {
  DiscoveryFilterSnapshot,
  DiscoveryFilterSurface,
} from './state/discoveryFilterSlice';

export interface DiscoveryFilterCapabilities {
  supportsPriceSort: boolean;
  supportsPreparationTimeSort: boolean;
  supportsNameSort: boolean;
  supportsDiet: boolean;
  supportsPriceRange: boolean;
  supportsPreparationTimeFilter: boolean;
  supportsSpiceFilter: boolean;
  supportsCuisine: boolean;
  supportsPopularitySort: boolean;
  supportsRatingSort: boolean;
  supportsDeliveryTimeSort: boolean;
  supportsResultCountPreview: boolean;
}

export function getDiscoveryFilterCapabilities(
  surface: DiscoveryFilterSurface,
): DiscoveryFilterCapabilities {
  if (surface === 'HOME') {
    return {
      supportsPriceSort: true,
      supportsPreparationTimeSort: true,
      supportsNameSort: true,
      supportsDiet: true,
      supportsPriceRange: true,
      supportsPreparationTimeFilter: true,
      supportsSpiceFilter: true,
      supportsCuisine: false,
      supportsPopularitySort: false,
      supportsRatingSort: false,
      supportsDeliveryTimeSort: false,
      supportsResultCountPreview: false,
    };
  }

  return {
    supportsPriceSort: false,
    supportsPreparationTimeSort: false,
    supportsNameSort: false,
    supportsDiet: false,
    supportsPriceRange: false,
    supportsPreparationTimeFilter: false,
    supportsSpiceFilter: false,
    supportsCuisine: false,
    supportsPopularitySort: false,
    supportsRatingSort: false,
    supportsDeliveryTimeSort: false,
    supportsResultCountPreview: false,
  };
}

export function applyHomeDiscoveryFilters(
  dishes: readonly NearbyDish[],
  filters: DiscoveryFilterSnapshot,
): NearbyDish[] {
  const dietSet = new Set(filters.diets);
  const filtered = dishes.filter(dish => {
    if (dietSet.size > 0 && !dietSet.has(dish.foodType)) return false;
    if (filters.minPrice !== null && dish.price < filters.minPrice) return false;
    if (filters.maxPrice !== null && dish.price > filters.maxPrice) return false;
    if (
      filters.maxPreparationTimeMinutes !== null &&
      (dish.preparationTimeMinutes === null ||
        dish.preparationTimeMinutes > filters.maxPreparationTimeMinutes)
    ) {
      return false;
    }
    if (
      filters.spiceLevel !== null &&
      dish.spiceLevel !== filters.spiceLevel
    ) {
      return false;
    }
    return true;
  });

  if (filters.sort === 'PRICE_LOW_TO_HIGH') {
    return filtered.sort((left, right) => left.price - right.price);
  }

  if (filters.sort === 'PRICE_HIGH_TO_LOW') {
    return filtered.sort((left, right) => right.price - left.price);
  }

  if (filters.sort === 'PREPARATION_TIME_ASC') {
    return filtered.sort(
      (left, right) =>
        (left.preparationTimeMinutes ?? Number.MAX_SAFE_INTEGER) -
        (right.preparationTimeMinutes ?? Number.MAX_SAFE_INTEGER),
    );
  }

  if (filters.sort === 'NAME_ASC') {
    return filtered.sort((left, right) =>
      left.itemName.localeCompare(right.itemName),
    );
  }

  return filtered;
}

/** Keeps dishes carrying the picked cuisine/diet labels. No labels loaded (off, failed, loading) means no filtering. */
export function applyDishLabelFilters(
  dishes: readonly NearbyDish[],
  filters: DiscoveryFilterSnapshot,
  labels: NearbyDishLabels | null,
): NearbyDish[] {
  if (!labels || (filters.cuisineIds.length === 0 && filters.dietTags.length === 0)) {
    return dishes as NearbyDish[];
  }
  const selection = {cuisines: filters.cuisineIds, diets: filters.dietTags};
  return dishes.filter(dish => {
    const codes = labels.byId.get(dish.id);
    return codes !== undefined && dishMatchesLabels(codes, selection, labels.vocabulary);
  });
}

/**
 * The labels Home filters with. While labels reload, useNearbyDishLabels keeps the last settled ones, so a new page
 * never flashes unfiltered dishes; null (no label filtering) only before the first load or after a failed one.
 */
export function labelsForHomeFilter(dishLabels: {
  labels: NearbyDishLabels | null;
  pending: boolean;
}): NearbyDishLabels | null {
  return dishLabels.labels;
}

/** Label filters run on loaded pages only, so Home keeps loading pages until this many dishes match... */
const LABEL_FILTER_TARGET_MATCHES = 20;
/** ...or this many pages are loaded (the feed keeps at most 10). */
export const LABEL_FILTER_MAX_PAGES = 10;

export function shouldLoadMoreForLabelFilter(state: {
  labelSelectionActive: boolean;
  labelsPending: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  matchingCount: number;
  loadedPages: number;
}): boolean {
  return (
    state.labelSelectionActive &&
    !state.labelsPending &&
    state.hasNextPage &&
    !state.isFetchingNextPage &&
    state.matchingCount < LABEL_FILTER_TARGET_MATCHES &&
    state.loadedPages < LABEL_FILTER_MAX_PAGES
  );
}
