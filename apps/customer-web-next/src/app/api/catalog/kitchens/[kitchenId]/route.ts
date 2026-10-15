import { NextRequest, NextResponse } from "next/server";
import { parseKitchenProfile } from "@/shared/lib/kitchen-profile-contract";
import { publicApiFetch } from "@/shared/lib/public-api";
import { isUuid } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ kitchenId: string }> }) {
  const { kitchenId } = await context.params;
  if (!isUuid(kitchenId)) return failure(400, "INVALID_KITCHEN_ID");
  try {
    const upstream = await publicApiFetch(`/catalog/kitchens/${kitchenId}`);
    const body: unknown = await upstream.json().catch(() => null);
    // The catalog answers 404 for a kitchen that is missing, not ACTIVE, or not selling yet.
    if (upstream.status === 404) return failure(404, "KITCHEN_NOT_FOUND");
    if (!upstream.ok) return failure(503, "KITCHEN_PROFILE_UNAVAILABLE");
    const profile = parseKitchenProfile(body);
    return profile && profile.id.toLowerCase() === kitchenId.toLowerCase()
      ? NextResponse.json(profile, { headers })
      : failure(502, "INVALID_KITCHEN_PROFILE_RESPONSE");
  } catch {
    return failure(503, "KITCHEN_PROFILE_UNAVAILABLE");
  }
}
