import { boundBffRequest } from "@/lib/bff-request-limits";
import { boundedFetch } from "@/lib/bounded-fetch";
import { NextRequest, NextResponse } from "next/server";
import { reverseGeocodeWithAzureMaps } from "@/lib/server/azure-maps";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 30;
const MAX_IN_FLIGHT = 4;
// No trusted proxy attestation exists here. Client-supplied headers never create budgets.
// At most 30 timestamps are retained, independent of request/header cardinality.
const admittedAt: number[] = [];
let inFlight = 0;

function locationProxyBase(): URL | null {
  const configured = process.env.CRAVES_LOCATION_PROXY_BASE_URL?.trim();
  if (!configured) return null;

  const base = new URL(configured);
  if (
    base.protocol !== "https:"
    || base.username
    || base.password
    || base.origin !== "https://craves.in"
  ) {
    throw new Error("CRAVES_LOCATION_PROXY_BASE_URL must be https://craves.in");
  }
  return base;
}


function admissionRetryAfter(): number | null {
  const now = Date.now();
  while (admittedAt.length > 0 && now - admittedAt[0] >= RATE_LIMIT_WINDOW_MS) {
    admittedAt.shift();
  }
  if (admittedAt.length >= RATE_LIMIT_REQUESTS) {
    return Math.max(1, Math.ceil((admittedAt[0] + RATE_LIMIT_WINDOW_MS - now) / 1_000));
  }
  if (inFlight >= MAX_IN_FLIGHT) return 1;
  admittedAt.push(now);
  inFlight += 1;
  return null;
}

export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request, { maxBytes: 1_024, timeoutMs: 2_000 });
  if (bounded instanceof NextResponse) return bounded;
  request = bounded;

  const body = (await request.json().catch(() => null)) as {
    latitude?: unknown;
    longitude?: unknown;
  } | null;
  const latitude = typeof body?.latitude === "number" ? body.latitude : Number.NaN;
  const longitude = typeof body?.longitude === "number" ? body.longitude : Number.NaN;

  if (
    !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    return NextResponse.json(
      { error: "INVALID_LOCATION", message: "A valid current location is required." },
      { status: 400 },
    );
  }

  const retryAfter = admissionRetryAfter();
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: "LOCATION_RATE_LIMITED", message: "Too many location lookups. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store, private" } },
    );
  }

  try {
    const proxyBase = locationProxyBase();
    if (proxyBase) {
      const proxyResponse = await boundedFetch(
        new URL("/api/location/reverse-geocode", proxyBase).toString(),
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Origin: proxyBase.origin,
            Referer: new URL("/profile/addresses", proxyBase).toString(),
          },
          body: JSON.stringify({ latitude, longitude }),
        },
        8_000,
        256 * 1_024,
      );
      const body = await proxyResponse.json().catch(() => null);
      if (!proxyResponse.ok || !body) {
        throw new Error(`Location proxy failed with HTTP ${proxyResponse.status}`);
      }
      return NextResponse.json(body, {
        headers: {
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const address = await reverseGeocodeWithAzureMaps(latitude, longitude);
    return NextResponse.json(address, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "REVERSE_GEOCODING_UNAVAILABLE",
        message: "Craves could not identify this address right now. Please try again.",
      },
      { status: 503, headers: { "Cache-Control": "no-store, private" } },
    );
  } finally {
    inFlight -= 1;
  }
}
