import {
  candidateDiscoveryRadii,
  DEFAULT_DISCOVERY_RADIUS_METERS,
  MAX_DISCOVERY_RADIUS_METERS,
} from "@/lib/catalog-discovery-policy";
import {
  parseKitchenDiscovery,
  type NearbyKitchen,
} from "@/lib/discovery-contract";

export type KitchenDiscoveryResult = {
  kitchens: NearbyKitchen[];
  radiusMeters: number;
};

let discoveredKitchens: NearbyKitchen[] = [];
let kitchenDiscoveryRadiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS;

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
      return {
        kitchens: [...discoveredKitchens],
        radiusMeters: candidateRadius,
      };
    }
  }

  discoveredKitchens = [];
  kitchenDiscoveryRadiusMeters = usedRadius;
  return { kitchens: [], radiusMeters: usedRadius };
}

export function allKitchens(): NearbyKitchen[] {
  return discoveredKitchens.filter(
    (kitchen) => kitchen.distanceMeters <= MAX_DISCOVERY_RADIUS_METERS,
  );
}

export function getKitchenDiscoveryRadiusMeters(): number {
  return kitchenDiscoveryRadiusMeters;
}

export function clearKitchenDiscoveryCache(): void {
  discoveredKitchens = [];
  kitchenDiscoveryRadiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS;
}
