import { NextRequest, NextResponse } from "next/server";
import { parseAdminIdentity } from "@/lib/admin-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" };

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/auth/me");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const response = NextResponse.json(
        { code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 403 ? "ADMIN_ACCESS_REQUIRED" : "IDENTITY_UNAVAILABLE" },
        { status: upstream.status, headers },
      );
      return response;
    }
    const identity = parseAdminIdentity(body);
    if (!identity) return NextResponse.json({ code: "INVALID_IDENTITY_RESPONSE" }, { status: 502, headers });
    if (!identity.adminEnabled) return NextResponse.json({ code: "ADMIN_ACCESS_REQUIRED" }, { status: 403, headers });
    return NextResponse.json(identity, { headers });
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      const response = NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401, headers });
      return response;
    }
    return NextResponse.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 503, headers });
  }
}
