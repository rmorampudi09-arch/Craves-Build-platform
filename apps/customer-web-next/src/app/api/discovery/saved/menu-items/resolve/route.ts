import { NextRequest, NextResponse } from "next/server";
import { parseSavedMenuItems, savedMenuItemsRequest } from "@/features/favorites/lib/saved-resolve-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { publicApiFetch } from "@/shared/lib/public-api";
import { isSameOrigin } from "@/shared/lib/request-security";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** Today's facts for saved dishes (name, price, photo, whether the kitchen is cooking). A public catalog read. */
export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const input = savedMenuItemsRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_SAVED_RESOLVE_REQUEST");
  try {
    const upstream = await publicApiFetch("/discovery/saved/menu-items/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.data),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "SAVED_RESOLVE_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const parsed = parseSavedMenuItems(body);
    return parsed ? NextResponse.json(parsed, { headers }) : failure(502, "INVALID_SAVED_RESOLVE_RESPONSE");
  } catch {
    return failure(503, "SAVED_RESOLVE_UNAVAILABLE");
  }
}
