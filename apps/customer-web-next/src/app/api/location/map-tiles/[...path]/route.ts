import { NextRequest, NextResponse } from "next/server";

import {
  isMapStyleDocument,
  MAP_TILES_PATH,
  mapTileQuery,
  mapTileUpstreamPath,
} from "@/lib/map-tiles";
import { isSameSitePublicRequest, publicRequestOrigin } from "@/lib/request-security";
import { fetchOlaMapsVectorResource, OlaMapsUnavailableError } from "@/lib/server/ola-maps";

const WINDOW_MS = 60_000;

/** Process-wide rolling budget, like the other location routes. */
function budget(maxPerWindow: number, maxInFlight: number) {
  const admittedAt: number[] = [];
  let inFlight = 0;
  return {
    /** Null when admitted, otherwise the Retry-After seconds. */
    admit(): number | null {
      const now = Date.now();
      while (admittedAt.length > 0 && now - admittedAt[0] >= WINDOW_MS) admittedAt.shift();
      if (admittedAt.length >= maxPerWindow) {
        return Math.max(1, Math.ceil((admittedAt[0] + WINDOW_MS - now) / 1_000));
      }
      if (inFlight >= maxInFlight) return 1;
      admittedAt.push(now);
      inFlight += 1;
      return null;
    },
    release() {
      inFlight -= 1;
    },
  };
}

// Ola bills each style load as one map load; tiles, glyphs and sprites follow from it.
const styleLoads = budget(60, 4);
const mapResources = budget(6_000, 64);

function privateError(error: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store, private", ...headers } },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  if (!isSameSitePublicRequest(request)) return privateError("ORIGIN_REJECTED", 403);

  const path = mapTileUpstreamPath((await params).path ?? []);
  const query = mapTileQuery(request.nextUrl.searchParams);
  if (!path || !query) return privateError("INVALID_MAP_RESOURCE", 400);

  const limiter = isMapStyleDocument(path) ? styleLoads : mapResources;
  const retryAfter = limiter.admit();
  if (retryAfter !== null) {
    return privateError("MAP_RATE_LIMITED", 429, { "Retry-After": String(retryAfter) });
  }

  try {
    const resource = await fetchOlaMapsVectorResource(
      path,
      query,
      publicRequestOrigin(request) + MAP_TILES_PATH,
    );
    const body = resource.bytes.buffer.slice(
      resource.bytes.byteOffset,
      resource.bytes.byteOffset + resource.bytes.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        "Content-Type": resource.contentType,
        // Documents name this request's origin; tiles, glyphs and sprites may stay in the browser cache.
        "Cache-Control": resource.contentType === "application/json"
          ? "private, no-store, max-age=0"
          : "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof OlaMapsUnavailableError && error.status === 404) {
      return privateError("MAP_RESOURCE_NOT_FOUND", 404);
    }
    return privateError("MAP_UNAVAILABLE", 503);
  } finally {
    limiter.release();
  }
}
