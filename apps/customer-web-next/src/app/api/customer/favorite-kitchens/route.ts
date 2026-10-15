import { NextRequest, NextResponse } from "next/server";
import { parseFavoriteKitchenPage } from "@/shared/lib/favorite-entities-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function GET(request: NextRequest) {
  try {
    // shortcut: first 100 saved kitchens only (the backend maximum); page with nextCursor when a list needs more.
    const upstream = await authenticatedApiFetch(request, "/customer/favorite-kitchens?limit=100");
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "FAVORITE_ENTITY_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const page = parseFavoriteKitchenPage(body);
    return page ? NextResponse.json(page, { headers }) : failure(502, "INVALID_FAVORITE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "FAVORITES_UNAVAILABLE");
  }
}
