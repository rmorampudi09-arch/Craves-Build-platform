import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { CHEF_AVATAR_IDS, parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** PUT {avatarId}: one of the 18 drawn faces becomes the chef's public picture; answers with the kitchen. */
export async function PUT(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const raw: unknown = await bounded.json().catch(() => null);
  const avatarId = raw && typeof raw === "object" ? (raw as Record<string, unknown>).avatarId : undefined;
  if (typeof avatarId !== "string" || !CHEF_AVATAR_IDS.includes(avatarId) || Object.keys(raw as object).length !== 1) {
    return failure(400, "INVALID_CHEF_AVATAR");
  }
  try {
    const upstream = await authenticatedApiFetch(bounded, "/kitchens/me/chef-avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarId }),
    });
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "CHEF_AVATAR_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const kitchen = parseChefKitchen(body);
    return kitchen ? NextResponse.json(kitchen, { headers }) : failure(502, "INVALID_KITCHEN_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "CHEF_AVATAR_UNAVAILABLE");
  }
}
