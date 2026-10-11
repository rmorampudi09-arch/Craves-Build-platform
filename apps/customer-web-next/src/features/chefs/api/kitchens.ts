import {
  candidateDiscoveryRadii,
  DEFAULT_DISCOVERY_RADIUS_METERS,
  MAX_DISCOVERY_RADIUS_METERS,
} from "@/features/home/lib/catalog-discovery-policy";
import {
  parseKitchenDiscovery,
  type NearbyKitchen,
} from "@/features/home/lib/discovery-contract";

export type KitchenDiscoveryResult = {
  kitchens: NearbyKitchen[];
  radiusMeters: number;
};

const KITCHEN_DISCOVERY_SNAPSHOT_KEY =
  "craves.customer.kitchen-discovery.snapshot.v1";

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

export async function discoverKitchens(
  latitude: number,
  longitude: number,
  radiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS,
): Promise<KitchenDiscoveryResult> {
  let usedRadius = radiusMeters;

  for (const candidateRadius of candidateDiscoveryRadii(radiusMeters)) {
    usedRadius = candidateRadius;
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      radiusMeters: String(candidateRadius),
      page: "0",
      size: "50",
    });

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

    const serviceableKitchens = payload.kitchens.filter(
      (kitchen) => kitchen.distanceMeters <= MAX_DISCOVERY_RADIUS_METERS,
    );

    if (serviceableKitchens.length > 0) {
      discoveredKitchens = serviceableKitchens;
      kitchenDiscoveryRadiusMeters = candidateRadius;
      rememberKitchenSnapshot();
      return {
        kitchens: [...discoveredKitchens],
        radiusMeters: candidateRadius,
      };
    }
  }

  discoveredKitchens = [];
  kitchenDiscoveryRadiusMeters = usedRadius;
  rememberKitchenSnapshot();
  return { kitchens: [], radiusMeters: usedRadius };
}

export function allKitchens(): NearbyKitchen[] {
  hydrateKitchenSnapshot();
  return discoveredKitchens.filter(
    (kitchen) => kitchen.distanceMeters <= MAX_DISCOVERY_RADIUS_METERS,
  );
}

export function getKitchenDiscoveryRadiusMeters(): number {
  hydrateKitchenSnapshot();
  return kitchenDiscoveryRadiusMeters;
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
