import { NextRequest, NextResponse } from "next/server";
import { favoriteHomesRequest, parseFavoriteHomeCards } from "@/features/favorites/lib/saved-resolve-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** Who among the customer's saved chefs and kitchens is cooking today. The gateway asks for a signed-in caller. */
export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const input = favoriteHomesRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_FAVORITE_HOME_REQUEST");
  try {
    const upstream = await authenticatedApiFetch(bounded, "/discovery/favorites/home/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "FAVORITE_HOME_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const parsed = parseFavoriteHomeCards(body);
    return parsed ? NextResponse.json(parsed, { headers }) : failure(502, "INVALID_FAVORITE_HOME_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "FAVORITE_HOME_UNAVAILABLE");
  }
}
