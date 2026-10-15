import { NextRequest, NextResponse } from "next/server";
import { parseUnreadCount } from "@/features/notifications/lib/notification-contract";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/** The bell's count; role=CHEF counts only Chef Mode notices. */
export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role");
  if (role !== null && role !== "CHEF" && role !== "CUSTOMER") return failure(400, "INVALID_NOTIFICATION_QUERY");
  try {
    const upstream = await authenticatedApiFetch(request, `/notifications/in-app/unread-count${role ? `?role=${role}` : ""}`);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "NOTIFICATIONS_UNAVAILABLE");
      return failure(mapped.status, mapped.code);
    }
    const unreadCount = parseUnreadCount(body);
    return unreadCount === null ? failure(502, "INVALID_NOTIFICATION_RESPONSE") : NextResponse.json({ unreadCount }, { headers });
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "NOTIFICATIONS_UNAVAILABLE");
  }
}
