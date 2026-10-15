import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { parseFavoriteWatch } from "@/shared/lib/favorite-entities-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ entityType: string; entityId: string }> };
const headers = { "Cache-Control": "no-store" };
const watchRequest = z.object({ enabled: z.boolean() }).strict();

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function PUT(request: NextRequest, context: Context) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const { entityType, entityId } = await context.params;
  if (entityType !== "CHEF" && entityType !== "KITCHEN") return failure(400, "INVALID_WATCH_ENTITY_TYPE");
  if (!isUuid(entityId)) return failure(400, "INVALID_WATCH_ENTITY_ID");
  const input = watchRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_WATCH_REQUEST");
  try {
    const upstream = await authenticatedApiFetch(bounded, `/customer/favorite-watches/${entityType}/${entityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Web notifications are in-app only; push belongs to the phone app.
      body: JSON.stringify({ channel: "IN_APP", enabled: input.data.enabled }),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "FAVORITE_ENTITY_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const watch = parseFavoriteWatch(body);
    return watch?.entityType === entityType && watch.entityId.toLowerCase() === entityId.toLowerCase()
      ? NextResponse.json(watch, { headers })
      : failure(502, "INVALID_FAVORITE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "FAVORITES_UNAVAILABLE");
  }
}
