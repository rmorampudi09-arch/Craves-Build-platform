import { NextRequest, NextResponse } from "next/server";
import { parseAdminIdentity } from "@/lib/admin-contract";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/auth/me");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const response = NextResponse.json(
        { code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 403 ? "ADMIN_ACCESS_REQUIRED" : "IDENTITY_UNAVAILABLE" },
        { status: upstream.status, headers: { "Cache-Control": "no-store" } },
      );
      if (upstream.status === 401) response.cookies.delete("craves_access_token");
      return response;
    }
    const identity = parseAdminIdentity(body);
    if (!identity) return NextResponse.json({ code: "INVALID_IDENTITY_RESPONSE" }, { status: 502 });
    if (!identity.adminEnabled) return NextResponse.json({ code: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
    return NextResponse.json(identity, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      const response = NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
      response.cookies.delete("craves_access_token");
      return response;
    }
    return NextResponse.json({ code: "IDENTITY_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
