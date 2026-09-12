import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, setSessionCookies } from "@/lib/auth-cookies";
import { isSameOrigin } from "@/lib/request-security";
import { apiBaseUrl } from "@/lib/server-api";
import { renewServerSession } from "@/lib/refresh-server";
import { sessionTiming } from "@/lib/refresh-policy";

const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" };
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403, headers });
  const refreshToken = request.cookies.get("craves_refresh_token")?.value;
  if (!refreshToken) return NextResponse.json({ code: "REFRESH_REQUIRED" }, { status: 401, headers });
  const supplied = request.headers.get("x-refresh-request-id");
  const requestId = supplied && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied) ? supplied : randomUUID();
  const result = await renewServerSession(apiBaseUrl(), refreshToken, requestId);
  if ("failure" in result) {
    const { status, code, terminal, retryAfter } = result.failure;
    const response = NextResponse.json({ code }, { status, headers: { ...headers, ...(retryAfter ? { "Retry-After": retryAfter } : {}) } });
    if (terminal) clearSessionCookies(response);
    return response;
  }
  const response = NextResponse.json({ identity: result.session.identity, timing: sessionTiming(result.session.accessToken) }, { headers });
  setSessionCookies(response, result.session);
  return response;
}
