import type {NearbyKitchen, NearbyKitchenPage} from './api/nearbyChefDiscoveryApi';
import type {NearbyDish} from '../home/api/homeFeedApi';
import {formatDishPrice} from '../home/homePresentation';

export interface KitchenDishSummary {
  imageUrls: string[];
  preparationTimeLabel: string | null;
  startingPriceLabel: string;
}

export function formatPreparationTime(dishes: readonly NearbyDish[]): string | null {
  const times = dishes
    .map(dish => dish.preparationTimeMinutes)
    .filter((value): value is number => typeof value === 'number');

  if (times.length === 0) return null;
  const minimum = Math.min(...times);
  const maximum = Math.max(...times);
  return minimum === maximum
    ? `${minimum} min`
    : `${minimum}–${maximum} min`;
}

/** Photos, prep time and cheapest price per kitchen, from the nearby dish feed. */
export function summarizeKitchenDishes(
  dishes: readonly NearbyDish[],
): Map<string, KitchenDishSummary> {
  const dishesByKitchen = new Map<string, NearbyDish[]>();
  for (const dish of dishes) {
    const current = dishesByKitchen.get(dish.kitchenId) ?? [];
    current.push(dish);
    dishesByKitchen.set(dish.kitchenId, current);
  }

  const summaries = new Map<string, KitchenDishSummary>();
  dishesByKitchen.forEach((kitchenDishes, kitchenId) => {
    const cheapestDish = kitchenDishes.reduce((cheapest, dish) =>
      dish.price < cheapest.price ? dish : cheapest,
    );
    summaries.set(kitchenId, {
      imageUrls: Array.from(
        new Set(
          kitchenDishes
            .map(dish => dish.primaryImageUrl?.trim() || null)
            .filter((url): url is string => Boolean(url)),
        ),
      ),
      preparationTimeLabel: formatPreparationTime(kitchenDishes),
      startingPriceLabel: formatDishPrice(cheapestDish.price, cheapestDish.currency),
    });
  });
  return summaries;
}

export function flattenNearbyKitchenPages(
  pages: NearbyKitchenPage[] | undefined,
): NearbyKitchen[] {
  if (!pages) {
    return [];
  }

  const byId = new Map<string, NearbyKitchen>();
  for (const page of pages) {
    for (const kitchen of page.kitchens) {
      byId.set(kitchen.id, kitchen);
    }
  }
  return [...byId.values()];
}

export function filterLoadedNearbyKitchens(
  kitchens: NearbyKitchen[],
  searchQuery: string,
): NearbyKitchen[] {
  const normalized = searchQuery.trim().toLocaleLowerCase();
  if (!normalized) {
    return kitchens;
  }

  return kitchens.filter(kitchen =>
    [
      kitchen.kitchenName,
      kitchen.description,
      kitchen.areaName,
      kitchen.city,
      kitchen.state,
    ]
      .filter((value): value is string => Boolean(value))
      .some(value => value.toLocaleLowerCase().includes(normalized)),
  );
}

export function formatKitchenDistance(distanceMeters: number): string {
  if (distanceMeters < 1_000) {
    return `${distanceMeters} m away`;
  }

  const kilometers = distanceMeters / 1_000;
  const precision = kilometers < 10 ? 1 : 0;
  return `${kilometers.toFixed(precision)} km away`;
}

export function formatKitchenLocation(kitchen: NearbyKitchen): string {
  return [kitchen.areaName, kitchen.city, kitchen.state].filter(Boolean).join(', ');
}

export function getKitchenInitials(kitchen: Pick<NearbyKitchen, 'kitchenName'>): string {
  const name = kitchen.kitchenName.trim();
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'C';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}