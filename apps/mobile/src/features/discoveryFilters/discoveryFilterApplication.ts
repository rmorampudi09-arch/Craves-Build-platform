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
