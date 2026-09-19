import { NextRequest, NextResponse } from "next/server";

import { boundBffRequest } from "@/lib/bff-request-limits";
import { searchAzureMapsAddresses } from "@/lib/server/azure-maps";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const admittedAt: number[] = [];
let inFlight = 0;
const MAX_IN_FLIGHT = 4;

function admissionRetryAfter(): number | null {
  const now = Date.now();
  while (admittedAt.length > 0 && now - admittedAt[0] >= WINDOW_MS) {
    admittedAt.shift();
  }
  if (admittedAt.length >= MAX_REQUESTS) {
    return Math.max(
      1,
      Math.ceil((admittedAt[0] + WINDOW_MS - now) / 1_000),
    );
  }
  if (inFlight >= MAX_IN_FLIGHT) return 1;
  admittedAt.push(now);
  inFlight += 1;
  return null;
}

export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request, {
    maxBytes: 2_048,
    timeoutMs: 2_000,
  });
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const latitude =
    typeof body?.latitude === "number" ? body.latitude : undefined;
  const longitude =
    typeof body?.longitude === "number" ? body.longitude : undefined;

  if (query.length < 2 || query.length > 160) {
    return NextResponse.json(
      {
        error: "INVALID_LOCATION_QUERY",
        message: "Enter at least two characters to search for an address.",
      },
      { status: 400 },
    );
  }

  if (
    (latitude !== undefined &&
      (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
    (longitude !== undefined &&
      (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
    (latitude === undefined) !== (longitude === undefined)
  ) {
    return NextResponse.json(
      { error: "INVALID_LOCATION", message: "Invalid search location." },
      { status: 400 },
    );
  }

  const retryAfter = admissionRetryAfter();
  if (retryAfter !== null) {
    return NextResponse.json(
      {
        error: "LOCATION_SEARCH_RATE_LIMITED",
        message: "Too many location searches. Please try again shortly.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store, private",
        },
      },
    );
  }

  try {
    const results = await searchAzureMapsAddresses(
      query,
      latitude,
      longitude,
    );
    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: "LOCATION_SEARCH_UNAVAILABLE",
        message: "Address search is unavailable right now. Please try again.",
      },
      { status: 503, headers: { "Cache-Control": "no-store, private" } },
    );
  } finally {
    inFlight -= 1;
  }
}
