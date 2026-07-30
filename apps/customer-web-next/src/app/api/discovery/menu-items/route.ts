import { NextRequest, NextResponse } from "next/server";
import { parseMenuDiscovery } from "@/lib/discovery-contract";
import { publicApiFetch } from "@/lib/public-api";

function numberParam(request: NextRequest, name: string, min: number, max: number): number | null {
  const raw = request.nextUrl.searchParams.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function integerParam(request: NextRequest, name: string, min: number, max: number, fallback: number): number | null {
  const raw = request.nextUrl.searchParams.get(name);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

export async function GET(request: NextRequest) {
  const latitude = numberParam(request, "latitude", -90, 90);
  const longitude = numberParam(request, "longitude", -180, 180);
  const radiusMeters = integerParam(request, "radiusMeters", 1, 100_000, 5_000);
  const page = integerParam(request, "page", 0, 10_000, 0);
  const size = integerParam(request, "size", 1, 50, 20);
  if (latitude === null || longitude === null || radiusMeters === null || page === null || size === null) {
    return NextResponse.json({ error: "INVALID_LOCATION", message: "Valid latitude, longitude and discovery bounds are required." }, { status: 400 });
  }
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), radiusMeters: String(radiusMeters), page: String(page), size: String(size) });
  try {
    const upstream = await publicApiFetch(`/discovery/menu-items?${query}`);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ error: "DISCOVERY_UNAVAILABLE", message: "Nearby dishes are unavailable right now." }, { status: upstream.status });
    const parsed = parseMenuDiscovery(body);
    if (!parsed) return NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Catalog response validation failed." }, { status: 502 });
    return NextResponse.json(parsed, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timeout ? "DISCOVERY_TIMEOUT" : "DISCOVERY_UNAVAILABLE", message: "Nearby dishes are unavailable right now." }, { status: timeout ? 504 : 502 });
  }
}
