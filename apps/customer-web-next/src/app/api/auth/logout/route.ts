import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth-cookies";
import { isSameOrigin } from "@/lib/request-security";
import { forgetServerRefresh } from "@/lib/refresh-server";
import { apiBaseUrl } from "@/lib/server-api";
import { boundedFetch } from "@/lib/bounded-fetch";

const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
function unconfirmed() {
  return NextResponse.json({ signedOut: false, code: "LOGOUT_UNCONFIRMED" }, { status: 503, headers });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403, headers });
  const refreshToken = request.cookies.get("craves_refresh_token")?.value;
  if (refreshToken) {
    try {
      const upstream = await boundedFetch(`${apiBaseUrl()}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      }, 5_000, 4096);
      if (!upstream.ok) return unconfirmed();
      const receipt = await upstream.json().catch(() => null) as { success?: unknown } | null;
      if (receipt?.success !== true) return unconfirmed();
      forgetServerRefresh(refreshToken);
    } catch {
      // Keep the server-only refresh receipt so an explicit retry can revoke it.
      return unconfirmed();
    }
  }
  const response = NextResponse.json({ signedOut: true }, { headers });
  clearSessionCookies(response);
  return response;
}
