import type {NearbyKitchen, NearbyKitchenPage} from './api/nearbyChefDiscoveryApi';

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
      kitchen.displayName,
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

export function getKitchenInitials(kitchen: NearbyKitchen): string {
  const name = (kitchen.displayName?.trim() || kitchen.kitchenName.trim());
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'C';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}