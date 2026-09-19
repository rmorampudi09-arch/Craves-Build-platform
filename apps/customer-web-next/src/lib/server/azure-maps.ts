import "server-only";
import { boundedFetch } from "@/lib/bounded-fetch";

import {
  parseReverseGeocodedAddress,
  type ReverseGeocodedAddress,
} from "@/lib/location-contract";

const AZURE_MAPS_RESOURCE = "https://atlas.microsoft.com/";
const DEFAULT_ENDPOINT = "https://atlas.microsoft.com";
const API_VERSION = "2026-01-01";

type ManagedIdentityTokenResponse = {
  access_token?: unknown;
  expires_on?: unknown;
};

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cachedToken: CachedToken | null = null;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function parseExpiry(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value * 1000;
  if (typeof value === "string") {
    const epoch = Number(value);
    if (Number.isFinite(epoch)) return epoch * 1000;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now() + 5 * 60_000;
}

async function managedIdentityToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs - Date.now() > 60_000) {
    return cachedToken.accessToken;
  }

  const endpoint = requiredEnvironment("IDENTITY_ENDPOINT");
  const identityHeader = requiredEnvironment("IDENTITY_HEADER");
  const url = new URL(endpoint);
  url.searchParams.set("resource", AZURE_MAPS_RESOURCE);
  url.searchParams.set("api-version", "2019-08-01");

  const response = await boundedFetch(url.toString(), {
    cache: "no-store",
    headers: { "X-IDENTITY-HEADER": identityHeader },
  }, 5_000, 32 * 1_024);
  if (!response.ok) {
    throw new Error(`Managed identity token request failed with HTTP ${response.status}`);
  }

  const body = (await response.json().catch(() => null)) as ManagedIdentityTokenResponse | null;
  const accessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  if (!accessToken) throw new Error("Managed identity token response did not include an access token");

  cachedToken = {
    accessToken,
    expiresAtMs: parseExpiry(body?.expires_on),
  };
  return accessToken;
}

export async function reverseGeocodeWithAzureMaps(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodedAddress> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("Invalid latitude");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Invalid longitude");
  }

  const mapsClientId = requiredEnvironment("AZURE_MAPS_CLIENT_ID");
  const endpoint = (process.env.AZURE_MAPS_ENDPOINT?.trim() || DEFAULT_ENDPOINT).replace(/\/$/, "");
  const token = await managedIdentityToken();
  const url = new URL(`${endpoint}/reverseGeocode`);
  url.searchParams.set("api-version", API_VERSION);
  url.searchParams.set("coordinates", `${longitude},${latitude}`);
  url.searchParams.set("view", "IN");

  const response = await boundedFetch(url.toString(), {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-ms-client-id": mapsClientId,
      "Accept-Language": "en-IN",
      Accept: "application/geo+json, application/json",
    },
  }, 7_000, 256 * 1_024);

  if (!response.ok) {
    throw new Error(`Azure Maps reverse geocoding failed with HTTP ${response.status}`);
  }

  const parsed = parseReverseGeocodedAddress(await response.json().catch(() => null));
  if (!parsed) throw new Error("Azure Maps returned an unusable reverse geocoding response");
  return parsed;
}

export type AzureMapsSearchResult = {
  id: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  houseNumber: string | null;
  street: string | null;
  area: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result || null;
}

function firstText(values: unknown[]): string | null {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return null;
}

function parseSearchResults(value: unknown): AzureMapsSearchResult[] {
  const root = object(value);
  const features = root && Array.isArray(root.features) ? root.features : [];
  const results: AzureMapsSearchResult[] = [];

  for (let index = 0; index < features.length && results.length < 6; index += 1) {
    const feature = object(features[index]);
    const geometry = feature ? object(feature.geometry) : null;
    const properties = feature ? object(feature.properties) : null;
    const address = properties ? object(properties.address) : null;
    const coordinates = geometry && Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : null;
    const longitude = typeof coordinates?.[0] === "number" ? coordinates[0] : Number.NaN;
    const latitude = typeof coordinates?.[1] === "number" ? coordinates[1] : Number.NaN;
    const formattedAddress = address ? text(address.formattedAddress) : null;

    if (
      !address
      || !formattedAddress
      || !Number.isFinite(latitude)
      || latitude < -90
      || latitude > 90
      || !Number.isFinite(longitude)
      || longitude < -180
      || longitude > 180
    ) {
      continue;
    }

    const adminDistricts = Array.isArray(address.adminDistricts)
      ? address.adminDistricts
          .map(object)
          .filter((item): item is JsonObject => Boolean(item))
      : [];
    const state = firstText([adminDistricts[0]?.name, adminDistricts[0]?.shortName]);
    const district = firstText([
      adminDistricts[1]?.name,
      adminDistricts[2]?.name,
      adminDistricts[3]?.name,
    ]);
    const city = firstText([address.locality, district]);
    const area = firstText([address.neighborhood, address.locality, district]);

    results.push({
      id: text(feature?.id) ?? `result-${index}-${latitude}-${longitude}`,
      formattedAddress,
      latitude,
      longitude,
      houseNumber: text(address.streetNumber),
      street: text(address.streetName),
      area,
      district,
      city,
      state,
      postalCode: text(address.postalCode),
    });
  }

  return results;
}

export async function searchAzureMapsAddresses(
  query: string,
  latitude?: number,
  longitude?: number,
): Promise<AzureMapsSearchResult[]> {
  const normalized = query.trim();
  if (normalized.length < 2 || normalized.length > 160) return [];

  const mapsClientId = requiredEnvironment("AZURE_MAPS_CLIENT_ID");
  const endpoint = (process.env.AZURE_MAPS_ENDPOINT?.trim() || DEFAULT_ENDPOINT).replace(/\/$/, "");
  const token = await managedIdentityToken();
  const url = new URL(`${endpoint}/geocode`);
  url.searchParams.set("api-version", API_VERSION);
  url.searchParams.set("query", normalized);
  url.searchParams.set("top", "6");
  url.searchParams.set("view", "IN");
  if (
    typeof latitude === "number"
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === "number"
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
  ) {
    url.searchParams.set("coordinates", `${longitude},${latitude}`);
  }

  const response = await boundedFetch(
    url.toString(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-ms-client-id": mapsClientId,
        "Accept-Language": "en-IN",
        Accept: "application/geo+json, application/json",
      },
    },
    7_000,
    512 * 1_024,
  );

  if (!response.ok) {
    throw new Error(`Azure Maps geocoding failed with HTTP ${response.status}`);
  }

  return parseSearchResults(await response.json().catch(() => null));
}

export async function renderAzureMapsStaticImage(
  latitude: number,
  longitude: number,
  zoom: number,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("Invalid latitude");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Invalid longitude");
  }
  if (!Number.isInteger(zoom) || zoom < 12 || zoom > 20) {
    throw new Error("Invalid zoom");
  }

  const mapsClientId = requiredEnvironment("AZURE_MAPS_CLIENT_ID");
  const endpoint = (process.env.AZURE_MAPS_ENDPOINT?.trim() || DEFAULT_ENDPOINT).replace(/\/$/, "");
  const token = await managedIdentityToken();
  const url = new URL(`${endpoint}/map/static`);
  url.searchParams.set("api-version", "2024-04-01");
  url.searchParams.set("tilesetId", "microsoft.base.road");
  url.searchParams.set("center", `${longitude},${latitude}`);
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("width", "900");
  url.searchParams.set("height", "520");
  url.searchParams.set("view", "IN");
  url.searchParams.set("language", "en-US");

  const response = await boundedFetch(
    url.toString(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-ms-client-id": mapsClientId,
        Accept: "image/png",
      },
    },
    7_000,
    2 * 1024 * 1024,
  );

  if (!response.ok) {
    throw new Error(`Azure Maps static map failed with HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (contentType !== "image/png" && contentType !== "image/jpeg") {
    throw new Error("Azure Maps returned an invalid map image");
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType,
  };
}
