import { NextRequest, NextResponse } from "next/server";
import { parseAdminIdentity } from "@/lib/admin-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { sessionTiming } from "@/lib/refresh-policy";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" };
export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/auth/me");
    if (!upstream.ok) return NextResponse.json({ code: upstream.status === 401 ? "SESSION_REQUIRED" : "SESSION_UNAVAILABLE" }, { status: upstream.status, headers });
    const identity = parseAdminIdentity(await upstream.json().catch(() => null));
    if (!identity) return NextResponse.json({ code: "SESSION_UNAVAILABLE" }, { status: 502, headers });
    if (!identity.adminEnabled) return NextResponse.json({ code: "ADMIN_ACCESS_REQUIRED" }, { status: 403, headers });
    const timing = sessionTiming(request.cookies.get("craves_access_token")?.value ?? "");
    if (!timing?.sessionExpiresAt) return NextResponse.json({ code: "ADMIN_REAUTHENTICATION_REQUIRED" }, { status: 401, headers });
    return NextResponse.json({ timing }, { headers });
  } catch (error) {
    return NextResponse.json({ code: error instanceof SessionRequiredError ? "SESSION_REQUIRED" : "SESSION_UNAVAILABLE" }, { status: error instanceof SessionRequiredError ? 401 : 503, headers });
  }
}
