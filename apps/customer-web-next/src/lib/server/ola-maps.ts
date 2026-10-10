import "server-only";
import { boundedFetch } from "@/lib/bounded-fetch";

import {
  parseOlaReverseGeocode,
  type ReverseGeocodedAddress,
} from "@/lib/location-contract";
import { rewriteMapDocument } from "@/lib/map-tiles";

const OLA_MAPS_ENDPOINT = "https://api.olamaps.io";
// The Ola credential restricts callers by domain; server calls are made on behalf of this site.
const CRAVES_ORIGIN = "https://craves.in";
const STATIC_STYLE = "default-light-standard";
const STATIC_WIDTH = 900;
const STATIC_HEIGHT = 520;
const MAX_SEARCH_RESULTS = 6;

export type LocationSearchResult = {
  id: string;
  title: string;
  subtitle: string | null;
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

export class OlaMapsUnavailableError extends Error {
  constructor(operation: string, reason: string, readonly status?: number) {
    super(`Ola Maps ${operation} unavailable: ${reason}`);
    this.name = "OlaMapsUnavailableError";
  }
}

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

function validCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === "number"
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === "number"
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;
}

const fixed = (value: number) => value.toFixed(7);

/** Operational signal only: never the URL (it carries the key), coordinates, queries or bodies. */
function unavailable(operation: string, reason: string, requestId?: string, status?: number): OlaMapsUnavailableError {
  console.warn(`[location] Ola Maps ${operation} unavailable: ${reason}${requestId ? ` (request ${requestId})` : ""}`);
  return new OlaMapsUnavailableError(operation, reason, status);
}

async function olaRequest(
  operation: string,
  path: string,
  params: Record<string, string>,
  accept: string,
  timeoutMs: number,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Response> {
  const key = process.env.OLA_MAPS_API_KEY?.trim();
  if (!key) throw unavailable(operation, "OLA_MAPS_API_KEY is not configured");

  const url = new URL(path, OLA_MAPS_ENDPOINT);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("api_key", key);
  const requestId = crypto.randomUUID();

  let response: Response;
  try {
    response = await boundedFetch(url.toString(), {
      headers: {
        Accept: accept,
        "Accept-Language": "en-IN",
        Origin: CRAVES_ORIGIN,
        Referer: `${CRAVES_ORIGIN}/`,
        "X-Request-Id": requestId,
      },
      signal,
    }, timeoutMs, maxBytes);
  } catch (error) {
    // A superseded typeahead request is normal; only provider-side failures are operational signals.
    if (signal?.aborted) throw error;
    const reason = error instanceof DOMException && error.name === "AbortError"
      ? "timeout"
      : error instanceof Error && error.message === "UPSTREAM_RESPONSE_TOO_LARGE"
        ? "response too large"
        : "network error";
    unavailable(operation, reason, requestId);
    throw error;
  }

  if (!response.ok) {
    throw unavailable(
      operation,
      response.status === 429 ? "rate limited (HTTP 429)" : `HTTP ${response.status}`,
      requestId,
      response.status,
    );
  }
  return response;
}

export async function reverseGeocodeWithOlaMaps(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodedAddress> {
  if (!validCoordinates(latitude, longitude)) throw new Error("Invalid coordinates");

  const response = await olaRequest(
    "reverse geocoding",
    "/places/v1/reverse-geocode",
    { latlng: `${fixed(latitude)},${fixed(longitude)}` },
    "application/json",
    7_000,
    256 * 1_024,
  );
  const parsed = parseOlaReverseGeocode(await response.json().catch(() => null));
  if (!parsed) throw unavailable("reverse geocoding", "no usable address in response");
  return parsed;
}

function parsePredictions(value: unknown): LocationSearchResult[] {
  const root = object(value);
  const predictions = root && Array.isArray(root.predictions) ? root.predictions : [];
  const results: LocationSearchResult[] = [];
  const seen = new Set<string>();

  for (const raw of predictions) {
    if (results.length >= MAX_SEARCH_RESULTS) break;
    const prediction = object(raw);
    const location = object(object(prediction?.geometry)?.location);
    const latitude = location?.lat;
    const longitude = location?.lng;
    const formattedAddress = text(prediction?.description);
    if (!formattedAddress || !validCoordinates(latitude, longitude)) continue;

    const id = text(prediction?.place_id) ?? `result-${fixed(latitude)}-${fixed(longitude as number)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const formatting = object(prediction?.structured_formatting);

    results.push({
      id,
      title: text(formatting?.main_text) ?? formattedAddress.split(",")[0].trim(),
      subtitle: text(formatting?.secondary_text),
      formattedAddress,
      latitude,
      longitude: longitude as number,
      // Autocomplete has no structured address; reverse geocoding the final pin fills these.
      houseNumber: null,
      street: null,
      area: null,
      district: null,
      city: null,
      state: null,
      postalCode: null,
    });
  }

  return results;
}

/** Optional "lat,lng" deployment bias (e.g. the main service city) when the caller sends no location. */
function defaultSearchCenter(): { latitude: number; longitude: number } | null {
  const [latitude, longitude] = (process.env.CRAVES_LOCATION_SEARCH_CENTER ?? "")
    .split(",")
    .map((part) => (part.trim() ? Number(part) : Number.NaN));
  return validCoordinates(latitude, longitude) ? { latitude, longitude } : null;
}

export async function searchOlaMapsAddresses(
  query: string,
  latitude?: number,
  longitude?: number,
  signal?: AbortSignal,
): Promise<LocationSearchResult[]> {
  const input = query.trim();
  if (input.length < 2 || input.length > 160) return [];

  const near = validCoordinates(latitude, longitude)
    ? { latitude, longitude: longitude as number }
    : defaultSearchCenter();
  const params: Record<string, string> = { input };
  // A bias, not a restriction: addresses in other Indian cities still match.
  if (near) params.location = `${fixed(near.latitude)},${fixed(near.longitude)}`;

  const response = await olaRequest(
    "autocomplete",
    "/places/v1/autocomplete",
    params,
    "application/json",
    7_000,
    512 * 1_024,
    signal,
  );
  const body = await response.json().catch(() => null);
  if (!object(body)) throw unavailable("autocomplete", "invalid JSON response");
  return parsePredictions(body);
}

export async function renderOlaMapsStaticImage(
  latitude: number,
  longitude: number,
  zoom: number,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!validCoordinates(latitude, longitude)) throw new Error("Invalid coordinates");
  if (!Number.isInteger(zoom) || zoom < 12 || zoom > 20) throw new Error("Invalid zoom");

  const response = await olaRequest(
    "static map",
    `/tiles/v1/styles/${STATIC_STYLE}/static/${fixed(longitude)},${fixed(latitude)},${zoom}/${STATIC_WIDTH}x${STATIC_HEIGHT}.png`,
    {},
    "image/png",
    12_000,
    3 * 1024 * 1024,
  );

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (contentType !== "image/png" && contentType !== "image/jpeg") {
    throw unavailable("static map", "response was not an image");
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType,
  };
}

const VECTOR_CONTENT_TYPES: Record<string, readonly string[]> = {
  pbf: ["application/x-protobuf", "application/vnd.mapbox-vector-tile", "application/octet-stream"],
  mvt: ["application/x-protobuf", "application/vnd.mapbox-vector-tile", "application/octet-stream"],
  png: ["image/png"],
  webp: ["image/webp"],
};

/**
 * One resource of the interactive Ola map (`path` is relative to /tiles/vector/v1 and already validated).
 * Style and TileJSON documents come back pointing at `proxyBase`, so the browser never needs the key.
 */
export async function fetchOlaMapsVectorResource(
  path: string,
  query: URLSearchParams,
  proxyBase: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const extension = path.slice(path.lastIndexOf(".") + 1);
  const document = extension === "json";
  const response = await olaRequest(
    "vector map",
    `/tiles/vector/v1/${path}`,
    Object.fromEntries(query),
    document ? "application/json" : extension === "png" || extension === "webp" ? `image/${extension}` : "application/x-protobuf",
    10_000,
    document ? 2 * 1024 * 1024 : 4 * 1024 * 1024,
  );

  if (document) {
    let rewritten: string;
    try {
      rewritten = rewriteMapDocument(await response.text(), proxyBase);
    } catch {
      throw unavailable("vector map", "invalid JSON document");
    }
    // Fail closed rather than hand the credential to a browser if Ola ever echoes it.
    if (rewritten.includes(process.env.OLA_MAPS_API_KEY?.trim() || "\u0000")) {
      throw unavailable("vector map", "document contained the credential");
    }
    return { bytes: new TextEncoder().encode(rewritten), contentType: "application/json" };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  // An empty tile (e.g. open sea) may arrive as 204 with no type.
  if (bytes.byteLength === 0) return { bytes, contentType: "application/x-protobuf" };
  if (!VECTOR_CONTENT_TYPES[extension]?.includes(contentType)) {
    throw unavailable("vector map", "unexpected content type");
  }
  return { bytes, contentType };
}
