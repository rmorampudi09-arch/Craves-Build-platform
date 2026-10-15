import { NextRequest, NextResponse } from "next/server";
import {
  parseChefKitchenSettings,
  parseChefKitchenSettingsUpdate,
} from "@/features/chef/lib/chef-schedule-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

async function call(request: NextRequest, init?: RequestInit) {
  try {
    const upstream = await authenticatedApiFetch(request, "/kitchens/me/settings", init);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "KITCHEN_SETTINGS_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const settings = parseChefKitchenSettings(body);
    return settings
      ? NextResponse.json(settings, { headers })
      : failure(502, "INVALID_KITCHEN_SETTINGS_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "KITCHEN_SETTINGS_UNAVAILABLE");
  }
}

export async function GET(request: NextRequest) {
  return call(request);
}

/** Replaces both settings: the screen always sends the pair. */
export async function PUT(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const settings = parseChefKitchenSettingsUpdate(await bounded.json().catch(() => null));
  if (!settings) return failure(400, "INVALID_KITCHEN_SETTINGS");
  return call(bounded, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}
