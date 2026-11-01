import {
  candidateDiscoveryRadii,
  DEFAULT_DISCOVERY_RADIUS_METERS,
  MAX_DISCOVERY_RADIUS_METERS,
} from "@/features/home/lib/catalog-discovery-policy";
import {
  parseKitchenDiscovery,
  type NearbyKitchen,
} from "@/features/home/lib/discovery-contract";
import type { SpiceLevel } from "@/shared/lib/spice-level";

export type KitchenDiscoveryResult = {
  kitchens: NearbyKitchen[];
  radiusMeters: number;
};

/** One page of nearby kitchens, nearest first, with the catalog's count of every kitchen in reach. */
export type KitchenPage = {
  kitchens: NearbyKitchen[];
  hasNext: boolean;
  totalElements: number;
};

const KITCHEN_PAGE_SIZE = 50;

const KITCHEN_DISCOVERY_SNAPSHOT_KEY =
  "craves.customer.kitchen-discovery.snapshot.v2";

let discoveredKitchens: NearbyKitchen[] = [];
let kitchenDiscoveryRadiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS;

function isKitchenSnapshot(value: unknown): value is KitchenDiscoveryResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    kitchens?: unknown;
    radiusMeters?: unknown;
  };
  return (
    Array.isArray(candidate.kitchens) &&
    typeof candidate.radiusMeters === "number"
  );
}

function rememberKitchenSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KITCHEN_DISCOVERY_SNAPSHOT_KEY,
      JSON.stringify({
        kitchens: discoveredKitchens,
        radiusMeters: kitchenDiscoveryRadiusMeters,
      }),
    );
  } catch {
    // Discovery cache is only a speed hint.
  }
}

function hydrateKitchenSnapshot(): void {
  if (
    typeof window === "undefined" ||
    discoveredKitchens.length > 0
  ) {
    return;
  }
  try {
    const raw = window.sessionStorage.getItem(KITCHEN_DISCOVERY_SNAPSHOT_KEY);
    if (!raw) return;
    const candidate = JSON.parse(raw);
    if (!isKitchenSnapshot(candidate)) return;
    discoveredKitchens = candidate.kitchens.filter(
      (kitchen) =>
        typeof kitchen.id === "string" &&
        typeof kitchen.kitchenName === "string" &&
        typeof kitchen.distanceMeters === "number",
    );
    kitchenDiscoveryRadiusMeters = candidate.radiusMeters;
  } catch {
    // Ignore stale or malformed client cache.
  }
}

/**
 * One page of the kitchens within `radiusMeters` (the Chefs tab reads the pages after the first
 * with it). It leaves the cached nearby kitchens Home and the kitchen pages reuse alone.
 */
export async function loadKitchenPage(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  page: number,
  spiceLevel?: SpiceLevel,
): Promise<KitchenPage> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radiusMeters: String(radiusMeters),
    page: String(page),
    size: String(KITCHEN_PAGE_SIZE),
  });
  if (spiceLevel) query.set("spiceLevel", spiceLevel);

  const response = await fetch(`/api/discovery/kitchens?${query}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "Nearby kitchens are temporarily unavailable.";
    throw new Error(message);
  }

  const payload = parseKitchenDiscovery(body);
  if (!payload) {
    throw new Error("Craves returned an invalid kitchen discovery response.");
  }
  return {
    kitchens: payload.kitchens.filter(
      (kitchen) => kitchen.distanceMeters <= MAX_DISCOVERY_RADIUS_METERS,
    ),
    hasNext: payload.page.hasNext,
    totalElements: payload.page.totalElements,
  };
}

/** The first page of nearby kitchens; without a spice level it also becomes the cache Home and the kitchen pages reuse. */
export async function discoverKitchens(
  latitude: number,
  longitude: number,
  radiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS,
  spiceLevel?: SpiceLevel,
): Promise<KitchenDiscoveryResult & Omit<KitchenPage, "kitchens">> {
  let usedRadius = radiusMeters;

  for (const candidateRadius of candidateDiscoveryRadii(radiusMeters)) {
    usedRadius = candidateRadius;
    const first = await loadKitchenPage(latitude, longitude, candidateRadius, 0, spiceLevel);
    // A spice-filtered list must not replace the nearby kitchens Home and the kitchen pages reuse.
    if (spiceLevel) return { ...first, radiusMeters: candidateRadius };

    if (first.kitchens.length > 0) {
      discoveredKitchens = first.kitchens;
      kitchenDiscoveryRadiusMeters = candidateRadius;
      rememberKitchenSnapshot();
      return {
        ...first,
        kitchens: [...discoveredKitchens],
        radiusMeters: candidateRadius,
      };
    }
  }

  discoveredKitchens = [];
  kitchenDiscoveryRadiusMeters = usedRadius;
  rememberKitchenSnapshot();
  return { kitchens: [], radiusMeters: usedRadius, hasNext: false, totalElements: 0 };
}

export function allKitchens(): NearbyKitchen[] {
  hydrateKitchenSnapshot();
  return discoveredKitchens.filter(
    (kitchen) => kitchen.distanceMeters <= MAX_DISCOVERY_RADIUS_METERS,
  );
}

export function clearKitchenDiscoveryCache(): void {
  discoveredKitchens = [];
  kitchenDiscoveryRadiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(KITCHEN_DISCOVERY_SNAPSHOT_KEY);
    } catch {
      // Nothing to clear.
    }
  }
}
