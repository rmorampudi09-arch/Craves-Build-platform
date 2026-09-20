import { NextRequest, NextResponse } from "next/server";

import { boundedFetch } from "@/lib/bounded-fetch";
import { isRequestOriginAllowed } from "@/lib/request-security";
import { renderAzureMapsStaticImage } from "@/lib/server/azure-maps";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 90;
const admittedAt: number[] = [];
let inFlight = 0;
const MAX_IN_FLIGHT = 6;

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


function publicOriginAllowed(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  let origin: string | null = null;
  try {
    origin = new URL(referer).origin;
  } catch {
    return false;
  }
  return isRequestOriginAllowed({
    origin,
    requestUrl: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    host: request.headers.get("host"),
  });
}

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

export async function GET(request: NextRequest) {
  if (!publicOriginAllowed(request)) {
    return NextResponse.json(
      { error: "ORIGIN_REJECTED" },
      { status: 403, headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const latitude = Number(request.nextUrl.searchParams.get("latitude"));
  const longitude = Number(request.nextUrl.searchParams.get("longitude"));
  const zoom = Number(request.nextUrl.searchParams.get("zoom") ?? "17");

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isInteger(zoom) ||
    zoom < 12 ||
    zoom > 20
  ) {
    return NextResponse.json(
      { error: "INVALID_MAP_LOCATION" },
      { status: 400, headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const retryAfter = admissionRetryAfter();
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: "MAP_RATE_LIMITED" },
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
    const proxyBase = locationProxyBase();
    if (proxyBase) {
      const proxyUrl = new URL("/api/location/map-image", proxyBase);
      proxyUrl.searchParams.set("latitude", String(latitude));
      proxyUrl.searchParams.set("longitude", String(longitude));
      proxyUrl.searchParams.set("zoom", String(zoom));

      const proxyResponse = await boundedFetch(
        proxyUrl.toString(),
        {
          cache: "no-store",
          headers: {
            Referer: new URL("/profile/addresses", proxyBase).toString(),
            "Sec-Fetch-Site": "same-origin",
            Accept: "image/png,image/jpeg",
          },
        },
        12_000,
        3 * 1024 * 1024,
      );
      if (!proxyResponse.ok) {
        throw new Error(`Map proxy failed with HTTP ${proxyResponse.status}`);
      }
      const contentType =
        proxyResponse.headers.get("content-type")?.split(";")[0] ?? "";
      if (contentType !== "image/png" && contentType !== "image/jpeg") {
        throw new Error("Map proxy returned an invalid image type");
      }
      return new NextResponse(await proxyResponse.arrayBuffer(), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const image = await renderAzureMapsStaticImage(
      latitude,
      longitude,
      zoom,
    );
    const body = image.bytes.buffer.slice(
      image.bytes.byteOffset,
      image.bytes.byteOffset + image.bytes.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "MAP_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store, private" } },
    );
  } finally {
    inFlight -= 1;
  }
}
