import type {NearbyDish} from '../home/api/homeFeedApi';
import type {
  DiscoveryFilterSnapshot,
  DiscoveryFilterSurface,
} from './state/discoveryFilterSlice';

export interface DiscoveryFilterCapabilities {
  supportsPriceSort: boolean;
  supportsDiet: boolean;
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
      supportsDiet: true,
      supportsCuisine: false,
      supportsPopularitySort: false,
      supportsRatingSort: false,
      supportsDeliveryTimeSort: false,
      supportsResultCountPreview: false,
    };
  }

  return {
    supportsPriceSort: false,
    supportsDiet: false,
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
  const filtered =
    dietSet.size === 0
      ? [...dishes]
      : dishes.filter(dish => dietSet.has(dish.foodType));

  if (filters.sort === 'PRICE_LOW_TO_HIGH') {
    return filtered.sort((left, right) => left.price - right.price);
  }

  if (filters.sort === 'PRICE_HIGH_TO_LOW') {
    return filtered.sort((left, right) => right.price - left.price);
  }

  return filtered;
}
