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
  const params = request.nextUrl.searchParams;
  // 100 is the backend's largest page; the cursor is its base64url nextCursor.
  const limit = params.get("limit") ?? "100", cursor = params.get("cursor");
  if (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 || (cursor !== null && !/^[A-Za-z0-9_-]{1,512}$/.test(cursor))) {
    return failure(400, "INVALID_FAVORITE_QUERY");
  }
  const query = new URLSearchParams({ limit });
  if (cursor) query.set("cursor", cursor);
  try {
    const upstream = await authenticatedApiFetch(request, `/customer/favorite-kitchens?${query}`);
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
