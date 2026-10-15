import { NextRequest, NextResponse } from "next/server";
import { parseNotificationPage } from "@/features/notifications/lib/notification-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** One page of the inbox, newest first; role=CHEF lists only Chef Mode notices. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit") ?? "50", cursor = params.get("cursor"), role = params.get("role");
  // Same limits as notification-service: 1 to 100 per page, a base64url cursor of at most 512 characters.
  if (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 || (cursor !== null && !/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) || (role !== null && role !== "CHEF" && role !== "CUSTOMER")) {
    return failure(400, "INVALID_NOTIFICATION_QUERY");
  }
  const query = new URLSearchParams({ limit: String(Number(limit)) });
  if (cursor) query.set("cursor", cursor);
  if (role) query.set("role", role);
  try {
    const upstream = await authenticatedApiFetch(request, `/notifications/in-app/page?${query}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "NOTIFICATIONS_UNAVAILABLE");
      return failure(mapped.status, mapped.code);
    }
    const page = parseNotificationPage(body);
    return page ? NextResponse.json(page, { headers }) : failure(502, "INVALID_NOTIFICATION_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "NOTIFICATIONS_UNAVAILABLE");
  }
}
