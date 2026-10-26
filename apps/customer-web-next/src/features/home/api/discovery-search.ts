import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/features/home/lib/catalog-discovery-policy";
import {
  parseKitchenDiscovery,
  parseMenuDiscovery,
  type NearbyKitchen,
  type NearbyMenuItem,
} from "@/features/home/lib/discovery-contract";

/** As in the app: the first 50 dishes and 50 kitchens that match, within 10 km. */
const SEARCH_PAGE_SIZE = 50;

/**
 * The catalog's matches for the search words around the delivery spot, so search finds dishes and
 * kitchens past the pages Home has loaded. A part that fails or is cancelled comes back empty.
 */
export async function searchNearby(
  latitude: number,
  longitude: number,
  words: string,
  signal: AbortSignal,
): Promise<{ dishes: NearbyMenuItem[]; kitchens: NearbyKitchen[] }> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radiusMeters: String(DEFAULT_DISCOVERY_RADIUS_METERS),
    page: "0",
    size: String(SEARCH_PAGE_SIZE),
    query: words,
  });
  const read = async (path: string) => {
    const response = await fetch(`${path}?${query}`, { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) throw new Error(`Search failed with ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  const [dishes, kitchens] = await Promise.allSettled([
    read("/api/discovery/menu-items").then(parseMenuDiscovery),
    read("/api/discovery/kitchens").then(parseKitchenDiscovery),
  ]);
  return {
    dishes: dishes.status === "fulfilled" ? dishes.value?.menuItems ?? [] : [],
    kitchens: kitchens.status === "fulfilled" ? kitchens.value?.kitchens ?? [] : [],
  };
}
