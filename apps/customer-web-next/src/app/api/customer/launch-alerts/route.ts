import { NextRequest, NextResponse } from "next/server";
import {
  parseLaunchAlertInput,
  parseLaunchAlertSpot,
  parseLaunchAlertStatus,
} from "@/features/home/lib/launch-alert-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

async function forward(request: NextRequest, path: string, init?: RequestInit) {
  try {
    const upstream = await authenticatedApiFetch(request, path, init);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "LAUNCH_ALERT_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const status = parseLaunchAlertStatus(body);
    return status
      ? NextResponse.json(status, { headers })
      : failure(502, "INVALID_LAUNCH_ALERT_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "LAUNCH_ALERT_UNAVAILABLE");
  }
}

/** Has this customer asked to hear when a kitchen opens at this spot? */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const spot = parseLaunchAlertSpot(params.get("latitude"), params.get("longitude"));
  if (!spot) return failure(400, "INVALID_LAUNCH_ALERT_SPOT");
  const query = new URLSearchParams({
    latitude: String(spot.latitude),
    longitude: String(spot.longitude),
  });
  return forward(request, `/customer/launch-alerts?${query}`);
}

/** Notify me: user-chef stores the spot (up to 50 per customer) and tells the customer when a kitchen opens. */
export async function PUT(request: NextRequest) {
  const bounded = await boundBffRequest(request, { maxBytes: 2048 });
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const input = parseLaunchAlertInput(await bounded.json().catch(() => null));
  if (!input) return failure(400, "INVALID_LAUNCH_ALERT");
  return forward(bounded, "/customer/launch-alerts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
