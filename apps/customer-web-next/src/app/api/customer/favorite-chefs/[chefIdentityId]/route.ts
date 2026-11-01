import { NextRequest, NextResponse } from "next/server";
import { parseFavoriteChef } from "@/shared/lib/favorite-entities-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ chefIdentityId: string }> };
const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

async function write(request: NextRequest, context: Context, method: "PUT" | "DELETE") {
  if (!isSameOrigin(request)) return failure(403, "ORIGIN_REJECTED");
  const { chefIdentityId } = await context.params;
  if (!isUuid(chefIdentityId)) return failure(400, "INVALID_CHEF_ID");
  try {
    const upstream = await authenticatedApiFetch(request, `/customer/favorite-chefs/${chefIdentityId}`, { method });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "FAVORITE_ENTITY_FAILED");
      return failure(mapped.status, mapped.code);
    }
    if (method === "DELETE") return new NextResponse(null, { status: 204, headers });
    const favorite = parseFavoriteChef(body);
    return favorite?.chefIdentityId.toLowerCase() === chefIdentityId.toLowerCase() ? NextResponse.json(favorite, { headers }) : failure(502, "INVALID_FAVORITE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "FAVORITES_UNAVAILABLE");
  }
}

export function PUT(request: NextRequest, context: Context) {
  return write(request, context, "PUT");
}

export function DELETE(request: NextRequest, context: Context) {
  return write(request, context, "DELETE");
}
