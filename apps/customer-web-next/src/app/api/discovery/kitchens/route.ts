import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_DISCOVERY_RADIUS_METERS,
  MAX_DISCOVERY_RADIUS_METERS,
} from "@/lib/catalog-discovery-policy";
import { parseKitchenDiscovery } from "@/lib/discovery-contract";
import { publicApiFetch } from "@/lib/public-api";

const QUERY_KEYS = new Set(["latitude", "longitude", "radiusMeters", "page", "size"]);
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function coordinate(value: string | null): number {
  return value !== null && value.length <= 32 && DECIMAL.test(value)
    ? Number(value)
    : Number.NaN;
}

function integer(value: string | null, fallback: number): number {
  return value === null
    ? fallback
    : value.length <= 10 && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const seen = new Set<string>();
  let invalidQuery = request.nextUrl.search.length > 256;

  if (!invalidQuery) {
    for (const [key] of params) {
      if (!QUERY_KEYS.has(key) || seen.has(key)) invalidQuery = true;
      seen.add(key);
    }
  }

  const latitude = coordinate(params.get("latitude"));
  const longitude = coordinate(params.get("longitude"));
  const radiusMeters = integer(
    params.get("radiusMeters"),
    DEFAULT_DISCOVERY_RADIUS_METERS,
  );
  const page = integer(params.get("page"), 0);
  const size = integer(params.get("size"), 20);

  if (
    invalidQuery ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isSafeInteger(radiusMeters) ||
    radiusMeters < 1 ||
    radiusMeters > MAX_DISCOVERY_RADIUS_METERS ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 1_000 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 50
  ) {
    return NextResponse.json(
      {
        error: "INVALID_LOCATION",
        message: "Valid latitude, longitude and discovery bounds are required.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    radiusMeters: String(radiusMeters),
    page: String(page),
    size: String(size),
  });

  try {
    const upstream = await publicApiFetch("/discovery/kitchens?" + query);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "DISCOVERY_UNAVAILABLE", message: "Nearby kitchens are unavailable right now." },
        { status: upstream.status },
      );
    }
    const parsed = parseKitchenDiscovery(body);
    if (!parsed) {
      return NextResponse.json(
        { error: "INVALID_UPSTREAM_RESPONSE", message: "Catalog response validation failed." },
        { status: 502 },
      );
    }
    const safeKitchens = parsed.kitchens.filter(
      (kitchen) => kitchen.distanceMeters <= MAX_DISCOVERY_RADIUS_METERS,
    );
    return NextResponse.json(
      { ...parsed, kitchens: safeKitchens },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timeout ? "DISCOVERY_TIMEOUT" : "DISCOVERY_UNAVAILABLE",
        message: "Nearby kitchens are unavailable right now.",
      },
      { status: timeout ? 504 : 502 },
    );
  }
}
